export interface LinePoint {
  time: number; // index or epoch seconds
  value: number;
}

export interface ChartOptions {
  background?: string;
  lineColor?: string;
  gridColor?: string;
  padding?: number;
}

export interface ChartHandle {
  setData: (data: LinePoint[]) => void;
  destroy: () => void;
}

/**
 * Create a very lightweight line chart inside a container.
 * This is a minimal example suitable for demo/testing in React/Tauri.
 */
export function createChart(container: HTMLElement, opts: ChartOptions = {}): ChartHandle {
  const options: Required<ChartOptions> = {
    background: opts.background ?? "#111",
    lineColor: opts.lineColor ?? "#4cc9f0",
    gridColor: opts.gridColor ?? "#333",
    padding: opts.padding ?? 16,
  };

  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.background = options.background;
  container.style.position = container.style.position || "relative";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;

  let data: LinePoint[] = [];

  function resize() {
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    draw();
}


  function drawGrid(width: number, height: number) {
    ctx.save();
    ctx.strokeStyle = options.gridColor;
    ctx.lineWidth = 1 * dpr;
    // vertical lines (quarters)
    for (let i = 1; i < 4; i++) {
      const x = (width / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    // horizontal lines (quarters)
    for (let i = 1; i < 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    const width = canvas.width;
    const height = canvas.height;
    // clear
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);

    drawGrid(width, height);

    if (data.length === 0) return;

    const pad = options.padding * dpr;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    const min = Math.min(...data.map((d) => d.value));
    const max = Math.max(...data.map((d) => d.value));
    const range = max - min || 1;

    ctx.save();
    ctx.translate(pad, pad);
    ctx.beginPath();
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = options.lineColor;

    for (let i = 0; i < data.length; i++) {
      const x = (i / Math.max(1, data.length - 1)) * innerW;
      const y = innerH - ((data[i].value - min) / range) * innerH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  return {
    setData(next) {
      data = next.slice();
      draw();
    },
    destroy() {
      ro.disconnect();
      if (canvas.parentElement === container) container.removeChild(canvas);
    },
  };
}

export { ChartX } from "./ChartX";