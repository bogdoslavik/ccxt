import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { createCanvas } from 'canvas';

const WIDTH = 5120;
const HEIGHT = 1440;
const PADDING = { top: 80, right: 160, bottom: 180, left: 220 };
const HOUR_MS = 60 * 60 * 1000;
const Y_STEP_PERCENT = 0.1;
const BACKGROUND_COLOR = '#ffffff';
const AXIS_COLOR = '#222222';
const GRID_COLOR = '#dddddd';
const GRID_BOLD_COLOR = '#bbbbbb';
const TEXT_COLOR = '#111111';
const LEGEND_TEXT_SIZE = 32;
const AXIS_TEXT_SIZE = 28;
const OUTPUT_PATH = process.env.FUNDING_SPREAD_OUTPUT ?? 'funding-spread.png';
const LOAD_PROGRESS_STEPS = 20;
const POINT_RADIUS = 2;
const MAX_LINE_GAP_MS = 2000;
const MIN_SYMBOL_DELTA_PERCENT = 0.2;

type SpreadDocument = {
    timestamp: Date;
    symbol: string;
    deltaWFees?: number;
};

const normalizeTimestamp = (value: Date | string | number): number => {
    if (value instanceof Date) {
        return value.getTime ();
    }
    return new Date (value).getTime ();
};

const clamp = (value: number, min: number, max: number): number => Math.min (max, Math.max (min, value));

const toPercentNumber = (value: unknown): number | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }
    const num = Number (value);
    return Number.isFinite (num) ? num : undefined;
};

const buildPalette = (symbols: string[]): Map<string, string> => {
    const palette = new Map<string, string> ();
    symbols.forEach ((symbol, index) => {
        const hue = (index * 137.508) % 360; // golden-angle to spread hues
        const color = `hsl(${hue}, 70%, 50%)`;
        palette.set (symbol, color);
    });
    return palette;
};

const drawLegend = (ctx, palette: Map<string, string>) => {
    const legendY = 30;
    const lineHeight = LEGEND_TEXT_SIZE + 8;
    const columnWidth = 360;
    const legendBottomLimit = (HEIGHT / 2) - 40;
    const legendHeight = Math.max (1, legendBottomLimit - legendY);
    const maxItemsPerColumn = Math.max (1, Math.floor (legendHeight / lineHeight));
    const entries = Array.from (palette.entries ());
    const columnsNeeded = Math.max (1, Math.ceil (entries.length / maxItemsPerColumn));
    const totalLegendWidth = columnsNeeded * columnWidth;
    const baseX = Math.max (20, (PADDING.left - totalLegendWidth - 20)) + columnWidth;
    let currentX = baseX;
    let currentY = legendY;
    ctx.font = `${LEGEND_TEXT_SIZE}px Inter, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT_COLOR;
    let itemsInColumn = 0;
    entries.forEach (([symbol, color]) => {
        if (itemsInColumn >= maxItemsPerColumn || (currentY + LEGEND_TEXT_SIZE > legendBottomLimit)) {
            itemsInColumn = 0;
            currentX += columnWidth;
            currentY = legendY;
        }
        ctx.fillStyle = color;
        ctx.fillRect (currentX, currentY, LEGEND_TEXT_SIZE, LEGEND_TEXT_SIZE);
        ctx.fillStyle = TEXT_COLOR;
        ctx.fillText (symbol, currentX + LEGEND_TEXT_SIZE + 12, currentY);
        currentY += lineHeight;
        itemsInColumn += 1;
    });
};

async function main (): Promise<void> {
    const mongoUri = process.env.MONGO_URI ?? 'mongodb://localhost:27017';
    const mongoClient = new MongoClient (mongoUri);
    await mongoClient.connect ();
    try {
        const collection = mongoClient.db ('funding').collection<SpreadDocument> ('spread');
        const filter = { deltaWFees: { $ne: null } };
        const totalDocs = await collection.countDocuments (filter);
        const cursor = collection.find (filter).sort ({ timestamp: 1 });
        const documents: SpreadDocument[] = [];
        let processed = 0;
        let lastLoggedStep = -1;
        for await (const doc of cursor) {
            documents.push (doc);
            processed += 1;
            if (totalDocs > 0) {
                const currentStep = Math.min (LOAD_PROGRESS_STEPS, Math.floor ((processed / totalDocs) * LOAD_PROGRESS_STEPS));
                if (currentStep > lastLoggedStep) {
                    const percent = ((processed / totalDocs) * 100).toFixed (1);
                    console.log (`Loading spread rows... ${processed}/${totalDocs} (${percent}%)`);
                    lastLoggedStep = currentStep;
                }
            } else if (processed % 1000 === 0) {
                console.log (`Loading spread rows... ${processed} processed`);
            }
        }
        if (totalDocs > 0 && processed < totalDocs) {
            console.log (`Loading spread rows... ${processed}/${totalDocs} (100.0%)`);
        }
        if (documents.length === 0) {
            console.log ('No spread documents found.');
            return;
        }
        let rows = documents
            .map ((doc) => ({
                symbol: doc.symbol ?? 'UNKNOWN',
                timestamp: normalizeTimestamp (doc.timestamp),
                deltaWFees: toPercentNumber (doc.deltaWFees) ?? 0,
            }))
            .filter ((row) => Number.isFinite (row.timestamp));
        if (rows.length === 0) {
            console.log ('No valid rows with timestamps.');
            return;
        }

        const symbolMax = new Map<string, number> ();
        rows.forEach ((row) => {
            const currentMax = symbolMax.get (row.symbol) ?? -Infinity;
            symbolMax.set (row.symbol, Math.max (currentMax, row.deltaWFees));
        });
        const allowedSymbols = new Set (
            Array.from (symbolMax.entries ())
                .filter (([, maxValue]) => maxValue > MIN_SYMBOL_DELTA_PERCENT)
                .map (([symbol]) => symbol)
        );
        rows = rows.filter ((row) => allowedSymbols.has (row.symbol));
        if (rows.length === 0) {
            console.log (`No symbols exceeded ${MIN_SYMBOL_DELTA_PERCENT.toFixed (1)}% delta.`);
            return;
        }

        const minTime = rows[0].timestamp;
        const maxTime = rows[rows.length - 1].timestamp;
        const timeRange = Math.max (1, maxTime - minTime);
        const maxDeltaValue = rows.reduce ((acc, row) => Math.max (acc, Math.max (0, row.deltaWFees)), 0);
        const yMax = Math.max (Y_STEP_PERCENT, Math.ceil (maxDeltaValue / Y_STEP_PERCENT) * Y_STEP_PERCENT);
        const canvas = createCanvas (WIDTH, HEIGHT);
        const ctx = canvas.getContext ('2d');
        ctx.fillStyle = BACKGROUND_COLOR;
        ctx.fillRect (0, 0, WIDTH, HEIGHT);

        const chartWidth = WIDTH - PADDING.left - PADDING.right;
        const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
        const chartLeft = PADDING.left;
        const chartBottom = HEIGHT - PADDING.bottom;
        const chartRight = chartLeft + chartWidth;

        const timeToX = (timestamp: number): number => {
            const ratio = (timestamp - minTime) / timeRange;
            return chartLeft + clamp (ratio, 0, 1) * chartWidth;
        };

        const valueToY = (value: number): number => {
            const clampedValue = clamp (Math.max (0, value), 0, yMax);
            const ratio = clampedValue / yMax;
            return chartBottom - ratio * chartHeight;
        };

        // Horizontal grid lines (0.1% increments)
        ctx.lineWidth = 1;
        ctx.setLineDash ([]);
        for (let val = 0; val <= yMax + 1e-9; val += Y_STEP_PERCENT) {
            const y = valueToY (val);
            ctx.strokeStyle = (Math.abs (val % (Y_STEP_PERCENT * 5)) < 1e-9) ? GRID_BOLD_COLOR : GRID_COLOR;
            ctx.beginPath ();
            ctx.moveTo (chartLeft, y);
            ctx.lineTo (chartRight, y);
            ctx.stroke ();
            ctx.fillStyle = TEXT_COLOR;
            ctx.font = `${AXIS_TEXT_SIZE}px Inter, Arial, sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText (`${val.toFixed (1)}%`, chartLeft - 20, y);
            ctx.textAlign = 'left';
            ctx.fillText (`${val.toFixed (1)}%`, chartRight + 20, y);
        }

        // Vertical hourly grid
        const firstHour = Math.ceil (minTime / HOUR_MS) * HOUR_MS;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let time = firstHour; time <= maxTime; time += HOUR_MS) {
            const x = timeToX (time);
            ctx.strokeStyle = GRID_COLOR;
            ctx.beginPath ();
            ctx.moveTo (x, PADDING.top);
            ctx.lineTo (x, chartBottom);
            ctx.stroke ();
            const date = new Date (time);
            const label = date.toISOString ().substring (11, 16);
            ctx.fillStyle = TEXT_COLOR;
            ctx.font = `${AXIS_TEXT_SIZE}px Inter, Arial, sans-serif`;
            ctx.fillText (label, x, chartBottom + 12);
        }

        // Axes
        ctx.strokeStyle = AXIS_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath ();
        ctx.moveTo (chartLeft, PADDING.top);
        ctx.lineTo (chartLeft, chartBottom);
        ctx.lineTo (chartRight, chartBottom);
        ctx.lineTo (chartRight, PADDING.top);
        ctx.stroke ();

        // Prepare series data
        const symbolSet = Array.from (new Set (rows.map ((row) => row.symbol))).sort ();
        const palette = buildPalette (symbolSet);
        const seriesMap = new Map<string, { color: string; points: { x: number; y: number; timestamp: number; value: number }[] }>();
        rows.forEach ((row) => {
            const color = palette.get (row.symbol) ?? '#000000';
            if (!seriesMap.has (row.symbol)) {
                seriesMap.set (row.symbol, { color, points: [] });
            }
            seriesMap.get (row.symbol).points.push ({
                x: timeToX (row.timestamp),
                y: valueToY (row.deltaWFees),
                value: row.deltaWFees,
                timestamp: row.timestamp,
            });
        });

        // Draw series lines
        const paletteEntries = Array.from (palette.entries ());
        seriesMap.forEach ((series, symbol) => {
            const pts = series.points.sort ((a, b) => a.timestamp - b.timestamp);
            if (pts.length === 0) {
                return;
            }
            ctx.strokeStyle = series.color;
            ctx.lineWidth = 1;
            for (let i = 1; i < pts.length; i++) {
                const prev = pts[i - 1];
                const current = pts[i];
                if ((current.timestamp - prev.timestamp) <= MAX_LINE_GAP_MS) {
                    ctx.beginPath (); 
                    ctx.moveTo (prev.x, prev.y);
                    ctx.lineTo (current.x, current.y);
                    ctx.stroke ();
                }
            }
            pts.forEach ((pt) => {
                ctx.fillStyle = series.color;
                ctx.beginPath ();
                ctx.arc (pt.x, pt.y, POINT_RADIUS, 0, Math.PI * 2);
                ctx.fill ();
            });

            const highest = pts.reduce ((maxPoint, point) => (point.value > maxPoint.value ? point : maxPoint), pts[0]);
            ctx.fillStyle = series.color;
            ctx.font = `${AXIS_TEXT_SIZE}px Inter, Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText (symbol, highest.x, highest.y - 8);
        });

        drawLegend (ctx, palette);

        const buffer = canvas.toBuffer ('image/png');
        const outputPath = path.resolve (OUTPUT_PATH);
        fs.writeFileSync (outputPath, buffer);
        console.log (`Chart written to ${outputPath}`);
    } finally {
        await mongoClient.close ();
    }
}

await main ();
