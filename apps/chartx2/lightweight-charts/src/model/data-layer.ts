/// <reference types="_build-time-constants" />

import { lowerBound } from '../helpers/algorithms';
import { ensureDefined } from '../helpers/assertions';
import { Mutable } from '../helpers/mutable';

import { SeriesDataItemTypeMap } from './data-consumer';
import { getSeriesPlotRowCreator, isSeriesPlotRow, WhitespacePlotRow } from './get-series-plot-row-creator';
import { IHorzScaleBehavior, InternalHorzScaleItem, InternalHorzScaleItemKey } from './ihorz-scale-behavior';
import { Series, SeriesUpdateInfo } from './series';
import { SeriesPlotRow } from './series-data';
import { SeriesType } from './series-options';
import {
	TickMarkWeightValue,
	TimePointIndex,
	TimeScalePoint,
} from './time-data';

// 仅关注 time 字段的泛型定义，便于在时间轴预处理中复用
export type TimedData<HorzScaleItem> = Pick<SeriesDataItemTypeMap<HorzScaleItem>[SeriesType], 'time'>;

// DataLayer 会在写入数据后返回 DataUpdateResponse，包含时间轴与序列的增量信息
export interface TimeScaleChanges {
	/**
	 * An index of the first changed time scale point by any type of change (time, weight, etc)
	 */
	firstChangedPointIndex?: TimePointIndex;

	/**
	 * An array of the new time scale points
	 */
	points?: readonly TimeScalePoint[];

	/**
	 * In terms of time scale "base index" means the latest time scale point with data (there might be whitespaces)
	 */
	baseIndex: TimePointIndex | null;
}

export interface SeriesChanges {
	/**
	 * Data to be merged into series' plot list
	 */
	data: readonly SeriesPlotRow<SeriesType>[];
	/**
	 * Additional info about this change
	 */
	info?: SeriesUpdateInfo;
}

export interface DataUpdateResponse {
	/**
	 * Contains updates for all _changed_ series (if series data doesn't changed then it will not be here)
	 */
	series: Map<Series<SeriesType>, SeriesChanges>;

	/**
	 * Contains optional time scale points
	 */
	timeScale: TimeScaleChanges;
}

interface TimePointData {
	index: TimePointIndex;
	timePoint: InternalHorzScaleItem;

	// actually the type of the value should be related to the series' type (generic type)
	// here, in data layer all data for us is "mutable" by default, but to the chart we provide "readonly" data, to avoid modifying it
	mapping: Map<Series<SeriesType>, Mutable<SeriesPlotRow<SeriesType> | WhitespacePlotRow>>;
}

export interface InternalTimeScalePoint extends Mutable<TimeScalePoint> {
	pointData: TimePointData;
}

// 创建一个空的时间点映射容器，后续会填充 series -> plotRow 的映射
function createEmptyTimePointData(timePoint: InternalHorzScaleItem): TimePointData {
	return { index: 0 as TimePointIndex, mapping: new Map(), timePoint };
}

interface SeriesRowsFirstAndLastTime {
	firstTime: InternalHorzScaleItemKey;
	lastTime: InternalHorzScaleItemKey;
}

// 计算系列的首尾时间 key，用于判断更新是追加还是覆盖
function seriesRowsFirstAndLastTime<TSeriesType extends SeriesType, HorzScaleItem>(seriesRows: SeriesPlotRow<TSeriesType>[] | undefined, bh: IHorzScaleBehavior<HorzScaleItem>): SeriesRowsFirstAndLastTime | undefined {
	if (seriesRows === undefined || seriesRows.length === 0) {
		return undefined;
	}

	return {
		firstTime: bh.key(seriesRows[0].time),
		lastTime: bh.key(seriesRows[seriesRows.length - 1].time),
	};
}

// 根据新旧数据的时间范围粗略判断是否属于实时更新，用于驱动末价动画
function seriesUpdateInfo<TSeriesType extends SeriesType, HorzScaleItem>(seriesRows: SeriesPlotRow<TSeriesType>[] | undefined, prevSeriesRows: SeriesPlotRow<TSeriesType>[] | undefined, bh: IHorzScaleBehavior<HorzScaleItem>): SeriesUpdateInfo | undefined {
	const firstAndLastTime = seriesRowsFirstAndLastTime(seriesRows, bh);
	const prevFirstAndLastTime = seriesRowsFirstAndLastTime(prevSeriesRows, bh);
	if (firstAndLastTime !== undefined && prevFirstAndLastTime !== undefined) {
		return {
			historicalUpdate: false,
			lastBarUpdatedOrNewBarsAddedToTheRight:
				firstAndLastTime.lastTime >= prevFirstAndLastTime.lastTime &&
				firstAndLastTime.firstTime >= prevFirstAndLastTime.firstTime,
		};
	}

	return undefined;
}

// 从同一时间点的多条 series 行中还原原始时间值（某些转换会生成内部索引）
function timeScalePointTime<TSeriesType extends SeriesType, HorzScaleItem>(mergedPointData: Map<Series<TSeriesType>, SeriesPlotRow<TSeriesType> | WhitespacePlotRow>): HorzScaleItem {
	let result: HorzScaleItem | undefined;
	mergedPointData.forEach((v: SeriesPlotRow<TSeriesType> | WhitespacePlotRow) => {
		if (result === undefined) {
			result = v.originalTime as HorzScaleItem;
		}
	});

	return ensureDefined(result);
}

// 增量更新时需要保留最初的 time（字符串/BusinessDay），存入 originalTime
function saveOriginalTime<TSeriesType extends SeriesType, HorzScaleItem>(data: SeriesDataItemWithOriginalTime<TSeriesType, HorzScaleItem>): void {
	if (data.originalTime === undefined) {
		data.originalTime = data.time;
	}
}

type SeriesDataItemWithOriginalTime<TSeriesType extends SeriesType, HorzScaleItem> = SeriesDataItemTypeMap<HorzScaleItem>[TSeriesType] & {
	originalTime: HorzScaleItem;
};

// DataLayer 作为模型与外部数据之间的缓冲层：负责维护按时间聚合的行映射，并输出增量更新信息
export class DataLayer<HorzScaleItem> {
// note that _pointDataByTimePoint and _seriesRowsBySeries shares THE SAME objects in their values between each other
// it's just different kind of maps to make usages/perf better
	private _pointDataByTimePoint: Map<InternalHorzScaleItemKey, TimePointData> = new Map();
	private _seriesRowsBySeries: Map<Series<SeriesType>, SeriesPlotRow<SeriesType>[]> = new Map();
	private _seriesLastTimePoint: Map<Series<SeriesType>, InternalHorzScaleItem> = new Map();

	// this is kind of "dest" values (in opposite to "source" ones) - we don't need to modify it manually, the only by calling _updateTimeScalePoints or updateSeriesData methods
	private _sortedTimePoints: readonly InternalTimeScalePoint[] = [];

	private readonly _horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>;

	public constructor(horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>) {
		// HorzScaleBehavior 定义了时间值的比较及内部转换逻辑，适配 BusinessDay/数值等多种输入
		this._horzScaleBehavior = horzScaleBehavior;
	}

	public destroy(): void {
		// 清空所有缓存，通常在 ChartModel 销毁时调用
		this._pointDataByTimePoint.clear();
		this._seriesRowsBySeries.clear();
		this._seriesLastTimePoint.clear();
		this._sortedTimePoints = [];
	}

	public setSeriesData<TSeriesType extends SeriesType>(series: Series<TSeriesType>, data: SeriesDataItemTypeMap<HorzScaleItem>[TSeriesType][]): DataUpdateResponse {
		// 全量替换某条 series 的数据：重建时间点映射，必要时触发时间轴重排
		let needCleanupPoints = this._pointDataByTimePoint.size !== 0;

		let isTimeScaleAffected = false;

		// save previous series rows data before it's replaced inside this._setRowsToSeries
		const prevSeriesRows = this._seriesRowsBySeries.get(series);
		if (prevSeriesRows !== undefined) {
			if (this._seriesRowsBySeries.size === 1) {
				needCleanupPoints = false;
				isTimeScaleAffected = true;

				// perf optimization - if there is only 1 series, then we can just clear and fill everything from scratch
				this._pointDataByTimePoint.clear();
			} else {
				// perf optimization - actually we have to use this._pointDataByTimePoint for going through here
				// but as soon as this._sortedTimePoints is just a different form of _pointDataByTimePoint we can use it as well
				for (const point of this._sortedTimePoints) {
					if (point.pointData.mapping.delete(series)) {
						isTimeScaleAffected = true;
					}
				}
			}
		}

		let seriesRows: (SeriesPlotRow<TSeriesType> | WhitespacePlotRow)[] = [];

		if (data.length !== 0) {
			// 先保留原始 time，之后通过行为转换为 InternalHorzScaleItem
			const originalTimes = data.map((d: SeriesDataItemTypeMap<HorzScaleItem>[TSeriesType]) => d.time);

			const timeConverter = this._horzScaleBehavior.createConverterToInternalObj(data);

			const createPlotRow = getSeriesPlotRowCreator<TSeriesType, HorzScaleItem>(series.seriesType());
			const dataToPlotRow = series.customSeriesPlotValuesBuilder();
			const customWhitespaceChecker = series.customSeriesWhitespaceCheck<HorzScaleItem>();

			seriesRows = data.map((item: SeriesDataItemTypeMap<HorzScaleItem>[TSeriesType], index: number) => {
				const time = timeConverter(item.time);

				const horzItemKey = this._horzScaleBehavior.key(time);

				let timePointData = this._pointDataByTimePoint.get(horzItemKey);
				if (timePointData === undefined) {
					// the indexes will be sync later
					timePointData = createEmptyTimePointData(time);
					this._pointDataByTimePoint.set(horzItemKey, timePointData);
					isTimeScaleAffected = true;
				}

				const row = createPlotRow(time, timePointData.index, item, originalTimes[index], dataToPlotRow, customWhitespaceChecker);
				timePointData.mapping.set(series, row);
				return row;
			});
		}

		if (needCleanupPoints) {
			// we deleted the old data from mapping and added the new ones
			// so there might be empty points now, let's remove them first
			// 清理掉 mapping 为空的时间点，防止时间轴残留空节点
			this._cleanupPointsData();
		}

		this._setRowsToSeries(series, seriesRows);

		let firstChangedPointIndex = -1;
		if (isTimeScaleAffected) {
			// then generate the time scale points
			// timeWeight will be updates in _updateTimeScalePoints later
			const newTimeScalePoints: InternalTimeScalePoint[] = [];
			this._pointDataByTimePoint.forEach((pointData: TimePointData) => {
				newTimeScalePoints.push({
					timeWeight: 0 as TickMarkWeightValue,
					time: pointData.timePoint,
					pointData,
					originalTime: timeScalePointTime(pointData.mapping),
				});
			});

			newTimeScalePoints.sort((t1: InternalTimeScalePoint, t2: InternalTimeScalePoint) => this._horzScaleBehavior.key(t1.time) - this._horzScaleBehavior.key(t2.time));

			firstChangedPointIndex = this._replaceTimeScalePoints(newTimeScalePoints);
		}

		return this._getUpdateResponse(
			series,
			firstChangedPointIndex,
			seriesUpdateInfo(this._seriesRowsBySeries.get(series), prevSeriesRows, this._horzScaleBehavior)
		);
	}

	public removeSeries(series: Series<SeriesType>): DataUpdateResponse {
		// 移除 series 等同于传入空数组，复用 setSeriesData 流程
		return this.setSeriesData(series, []);
	}

	public updateSeriesData<TSeriesType extends SeriesType>(series: Series<TSeriesType>, data: SeriesDataItemTypeMap<HorzScaleItem>[TSeriesType], historicalUpdate: boolean): DataUpdateResponse {
		// 增量更新单条数据：historicalUpdate=true 表示覆写历史点，否则认为是实时追加
		const extendedData = data as SeriesDataItemWithOriginalTime<TSeriesType, HorzScaleItem>;
		saveOriginalTime(extendedData);
		// convertStringToBusinessDay(data);
		this._horzScaleBehavior.preprocessData(data);
		const timeConverter = this._horzScaleBehavior.createConverterToInternalObj([data]);

		const time = timeConverter(data.time);

		const lastSeriesTime = this._seriesLastTimePoint.get(series);
		if (!historicalUpdate && lastSeriesTime !== undefined && this._horzScaleBehavior.key(time) < this._horzScaleBehavior.key(lastSeriesTime)) {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			throw new Error(`Cannot update oldest data, last time=${lastSeriesTime}, new time=${time}`);
		}

		let pointDataAtTime = this._pointDataByTimePoint.get(this._horzScaleBehavior.key(time));

		if (historicalUpdate && pointDataAtTime === undefined) {
			throw new Error('Cannot update non-existing data point when historicalUpdate is true');
		}

		// if no point data found for the new data item
		// that means that we need to update scale
		const affectsTimeScale = pointDataAtTime === undefined;

		if (pointDataAtTime === undefined) {
			// the indexes will be sync later
			pointDataAtTime = createEmptyTimePointData(time);
			this._pointDataByTimePoint.set(this._horzScaleBehavior.key(time), pointDataAtTime);
		}

		const createPlotRow = getSeriesPlotRowCreator<SeriesType, HorzScaleItem>(series.seriesType());
		const dataToPlotRow = series.customSeriesPlotValuesBuilder();
		const customWhitespaceChecker = series.customSeriesWhitespaceCheck<HorzScaleItem>();
		const plotRow = createPlotRow(time, pointDataAtTime.index, data, extendedData.originalTime, dataToPlotRow, customWhitespaceChecker);

		pointDataAtTime.mapping.set(series, plotRow);

		if (historicalUpdate) {
			this._updateHistoricalSeriesRow(series, plotRow, pointDataAtTime.index);
		} else {
			this._updateLastSeriesRow(series, plotRow);
		}

		const info: SeriesUpdateInfo = {
			lastBarUpdatedOrNewBarsAddedToTheRight: isSeriesPlotRow(plotRow),
			historicalUpdate,
		};

		// if point already exist on the time scale - we don't need to make a full update and just make an incremental one
		if (!affectsTimeScale) {
			// 时间轴未新增节点，直接返回增量更新信息
			return this._getUpdateResponse(series, -1, info);
		}

		const newPoint: InternalTimeScalePoint = {
			timeWeight: 0 as TickMarkWeightValue,
			time: pointDataAtTime.timePoint,
			pointData: pointDataAtTime,
			originalTime: timeScalePointTime(pointDataAtTime.mapping),
		};

		const insertIndex = lowerBound(this._sortedTimePoints, this._horzScaleBehavior.key(newPoint.time), (a: InternalTimeScalePoint, b: number) => this._horzScaleBehavior.key(a.time) < b);

		// yes, I know that this array is readonly and this change is intended to make it performative
		// we marked _sortedTimePoints array as readonly to avoid modifying this array anywhere else
		// but this place is exceptional case due performance reasons, sorry
		(this._sortedTimePoints as InternalTimeScalePoint[]).splice(insertIndex, 0, newPoint);

		for (let index = insertIndex; index < this._sortedTimePoints.length; ++index) {
			assignIndexToPointData(this._sortedTimePoints[index].pointData, index as TimePointIndex);
		}

		this._horzScaleBehavior.fillWeightsForPoints(this._sortedTimePoints, insertIndex);

		return this._getUpdateResponse(series, insertIndex, info);
	}

	private _updateLastSeriesRow(series: Series<SeriesType>, plotRow: SeriesPlotRow<SeriesType> | WhitespacePlotRow): void {
		// 维护 series 缓存的最后一根数据，实时模式下只需更新末尾元素
		let seriesData = this._seriesRowsBySeries.get(series);
		if (seriesData === undefined) {
			seriesData = [];
			this._seriesRowsBySeries.set(series, seriesData);
		}

		const lastSeriesRow = seriesData.length !== 0 ? seriesData[seriesData.length - 1] : null;

		if (lastSeriesRow === null || this._horzScaleBehavior.key(plotRow.time) > this._horzScaleBehavior.key(lastSeriesRow.time)) {
			if (isSeriesPlotRow(plotRow)) {
				seriesData.push(plotRow);
			}
		} else {
			if (isSeriesPlotRow(plotRow)) {
				seriesData[seriesData.length - 1] = plotRow;
			} else {
				seriesData.splice(-1, 1);
			}
		}

		this._seriesLastTimePoint.set(series, plotRow.time);
	}

	private _updateHistoricalSeriesRow(series: Series<SeriesType>, plotRow: SeriesPlotRow<SeriesType> | WhitespacePlotRow, pointDataIndex: number): void {
		// historicalUpdate=true 时按索引写入缓存（保持数组有序）
		const seriesData = this._seriesRowsBySeries.get(series);
		if (seriesData === undefined) {
			return;
		}
		// binary search for actual index in array.
		const index = lowerBound(seriesData, pointDataIndex, (row: SeriesPlotRow<SeriesType>, currentIndex: number): boolean =>
			row.index < currentIndex
		);
		if (isSeriesPlotRow(plotRow)) {
			seriesData[index] = plotRow;
		} else {
			seriesData.splice(index, 1);
		}
	}

	private _setRowsToSeries(series: Series<SeriesType>, seriesRows: (SeriesPlotRow<SeriesType> | WhitespacePlotRow)[]): void {
		// 全量重置时，存储非 whitespace 行并记录最后时间点，供增量更新校验
		if (seriesRows.length !== 0) {
			this._seriesRowsBySeries.set(series, seriesRows.filter(isSeriesPlotRow));
			this._seriesLastTimePoint.set(series, seriesRows[seriesRows.length - 1].time);
		} else {
			this._seriesRowsBySeries.delete(series);
			this._seriesLastTimePoint.delete(series);
		}
	}

	private _cleanupPointsData(): void {
		// 遍历全部已排序时间点，移除已无任何 series 映射的节点
		// let's treat all current points as "potentially removed"
		// we could create an array with actually potentially removed points
		// but most likely this array will be similar to _sortedTimePoints so let's avoid using additional memory
		// note that we can use _sortedTimePoints here since a point might be removed only it was here previously
		for (const point of this._sortedTimePoints) {
			if (point.pointData.mapping.size === 0) {
				this._pointDataByTimePoint.delete(this._horzScaleBehavior.key(point.time));
			}
		}
	}

	/**
	 * Sets new time scale and make indexes valid for all series
	 *
	 * @returns The index of the first changed point or `-1` if there is no change.
	 */
	private _replaceTimeScalePoints(newTimePoints: InternalTimeScalePoint[]): number {
		// 替换整张时间轴，返回首个发生变化的索引，便于 GUI 做增量重绘
		let firstChangedPointIndex = -1;

		// search the first different point and "syncing" time weight by the way
		for (let index = 0; index < this._sortedTimePoints.length && index < newTimePoints.length; ++index) {
			const oldPoint = this._sortedTimePoints[index];
			const newPoint = newTimePoints[index];
			if (this._horzScaleBehavior.key(oldPoint.time) !== this._horzScaleBehavior.key(newPoint.time)) {
				firstChangedPointIndex = index;
				break;
			}

			// re-assign point's time weight for points if time is the same (and all prior times was the same)
			newPoint.timeWeight = oldPoint.timeWeight;

			assignIndexToPointData(newPoint.pointData, index as TimePointIndex);
		}

		if (firstChangedPointIndex === -1 && this._sortedTimePoints.length !== newTimePoints.length) {
			// the common part of the prev and the new points are the same
			// so the first changed point is the next after the common part
			firstChangedPointIndex = Math.min(this._sortedTimePoints.length, newTimePoints.length);
		}

		if (firstChangedPointIndex === -1) {
			// if no time scale changed, then do nothing
			return -1;
		}

		// if time scale points are changed that means that we need to make full update to all series (with clearing points)
		// but first we need to synchronize indexes and re-fill time weights
		for (let index = firstChangedPointIndex; index < newTimePoints.length; ++index) {
			assignIndexToPointData(newTimePoints[index].pointData, index as TimePointIndex);
		}

		// re-fill time weights for point after the first changed one
		this._horzScaleBehavior.fillWeightsForPoints(newTimePoints, firstChangedPointIndex);

		this._sortedTimePoints = newTimePoints;

		return firstChangedPointIndex;
	}

	private _getBaseIndex(): TimePointIndex | null {
		// baseIndex = 所有 series 中最后一根的索引，用于十字线与右偏移计算
		if (this._seriesRowsBySeries.size === 0) {
			// if we have no data then 'reset' the base index to null
			return null;
		}

		let baseIndex = 0 as TimePointIndex;

		this._seriesRowsBySeries.forEach((data: SeriesPlotRow<SeriesType>[]) => {
			if (data.length !== 0) {
				baseIndex = Math.max(baseIndex, data[data.length - 1].index) as TimePointIndex;
			}
		});

		return baseIndex;
	}

	private _getUpdateResponse(updatedSeries: Series<SeriesType>, firstChangedPointIndex: number, info?: SeriesUpdateInfo): DataUpdateResponse {
		// 汇总所有需要刷新的 series，并附带时间轴变化信息
		const dataUpdateResponse: DataUpdateResponse = {
			series: new Map(),
			timeScale: {
				baseIndex: this._getBaseIndex(),
			},
		};

		if (firstChangedPointIndex !== -1) {
			// TODO: it's possible to make perf improvements by checking what series has data after firstChangedPointIndex
			// but let's skip for now
			this._seriesRowsBySeries.forEach((data: SeriesPlotRow<SeriesType>[], s: Series<SeriesType>) => {
				dataUpdateResponse.series.set(
					s,
					{
						data,
						info: s === updatedSeries ? info : undefined,
					}
				);
			});

			// if the series data was set to [] it will have already been removed from _seriesRowBySeries
			// meaning the forEach above won't add the series to the data update response
			// so we handle that case here
			if (!this._seriesRowsBySeries.has(updatedSeries)) {
				dataUpdateResponse.series.set(updatedSeries, { data: [], info });
			}

			dataUpdateResponse.timeScale.points = this._sortedTimePoints;
			dataUpdateResponse.timeScale.firstChangedPointIndex = firstChangedPointIndex as TimePointIndex;
		} else {
			const seriesData = this._seriesRowsBySeries.get(updatedSeries);
			// if no seriesData found that means that we just removed the series
			dataUpdateResponse.series.set(updatedSeries, { data: seriesData || [], info });
		}

		return dataUpdateResponse;
	}
}

function assignIndexToPointData<HorzScaleItem>(pointData: TimePointData, index: TimePointIndex): void {
// first, nevertheless update index of point data ("make it valid")
	pointData.index = index;

	// and then we need to sync indexes for all series
	pointData.mapping.forEach((seriesRow: Mutable<SeriesPlotRow<SeriesType> | WhitespacePlotRow>) => {
		seriesRow.index = index;
	});
}
