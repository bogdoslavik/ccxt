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
    const legendX = 40;
    const legendY = 30;
    const lineHeight = LEGEND_TEXT_SIZE + 8;
    const columnWidth = 360;
    let currentX = legendX;
    let currentY = legendY;
    ctx.font = `${LEGEND_TEXT_SIZE}px Inter, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = TEXT_COLOR;
    let itemsInColumn = 0;
    const legendHeight = Math.max (1, (HEIGHT / 2) - legendY - 40);
    const maxItemsPerColumn = Math.max (1, Math.floor (legendHeight / lineHeight));
    palette.forEach ((color, symbol) => {
        if (itemsInColumn >= maxItemsPerColumn) {
            itemsInColumn = 0;
            currentX += columnWidth;
            currentY = legendY;
        }
        ctx.fillStyle = color;
        ctx.fillRect (currentX, currentY, LEGEND_TEXT_SIZE, LEGEND_TEXT_SIZE);
        ctx.fillStyle = TEXT_COLOR;
        ctx.textAlign = 'left';
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
        const documents = await collection.find ({ deltaWFees: { $ne: null } }).sort ({ timestamp: 1 }).toArray ();
        if (documents.length === 0) {
            console.log ('No spread documents found.');
            return;
        }
        const rows = documents
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
        const seriesMap = new Map<string, { color: string; points: { x: number; y: number }[] }>();
        rows.forEach ((row) => {
            const color = palette.get (row.symbol) ?? '#000000';
            if (!seriesMap.has (row.symbol)) {
                seriesMap.set (row.symbol, { color, points: [] });
            }
            seriesMap.get (row.symbol).points.push ({
                x: timeToX (row.timestamp),
                y: valueToY (row.deltaWFees),
            });
        });

        // Draw series lines
        seriesMap.forEach ((series) => {
            const pts = series.points.sort ((a, b) => a.x - b.x);
            if (pts.length === 0) {
                return;
            }
            ctx.strokeStyle = series.color;
            ctx.lineWidth = 3;
            ctx.beginPath ();
            ctx.moveTo (pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo (pts[i].x, pts[i].y);
            }
            ctx.stroke ();
            // draw points
            pts.forEach ((pt) => {
                ctx.fillStyle = series.color;
                ctx.beginPath ();
                ctx.arc (pt.x, pt.y, 4, 0, Math.PI * 2);
                ctx.fill ();
            });
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
