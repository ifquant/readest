// eslint-disable-next-line @typescript-eslint/naming-convention
// standalone 构建产物：将主入口挂载到全局对象
import * as LightweightChartsModule from './index';

// put all exports from package to window.LightweightCharts object
// eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-member-access
(window as any).LightweightCharts = LightweightChartsModule;
