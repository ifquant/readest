import { ensureNotNull } from '../helpers/assertions';

import { Coordinate } from '../typings/coordinate';

/**
 * 璁板綍涓€娆′綅绉婚噰鏍风殑鏃堕棿鎴充笌浣嶇疆锛岀敤浜庢帹鏂嫋鎷界殑閫熷害瓒嬪娍銆?
 */
interface TimeAndPosition {
	time: number;
	position: Coordinate;
}

const enum Constants {
	MaxStartDelay = 50,
	EpsilonDistance = 1, // distance to the end position where we stop animation
}

/**
 * 璁＄畻涓や釜閲囨牱鐐逛箣闂寸殑浣嶇Щ璺濈銆?
 */
function distanceBetweenPoints(pos1: TimeAndPosition, pos2: TimeAndPosition): number {
	return pos1.position - pos2.position;
}

/**
 * 鏍规嵁涓や釜閲囨牱鐐硅绠楁瘡姣鍍忕礌閫熷害锛屽苟鎴柇鍦ㄥ厑璁哥殑鏈€澶ч€熷害鑼冨洿涔嬪唴銆?
 */
function speedPxPerMSec(pos1: TimeAndPosition, pos2: TimeAndPosition, maxSpeed: number): number {
	const speed = (pos1.position - pos2.position) / (pos1.time - pos2.time);
	return Math.sign(speed) * Math.min(Math.abs(speed), maxSpeed);
}

/**
 * 渚濇嵁缁欏畾鐨勫垵濮嬮€熷害涓庨樆灏肩郴鏁帮紝鎺ㄥ鍑鸿“鍑忚嚦鍋滀笅鎵€闇€鐨勬椂闂撮暱搴︺€?
 */
function durationMSec(speed: number, dumpingCoeff: number): number {
	const lnDumpingCoeff = Math.log(dumpingCoeff);
	return Math.log((Constants.EpsilonDistance * lnDumpingCoeff) / -speed) / (lnDumpingCoeff);
}

export class KineticAnimation {
	private _position1: TimeAndPosition | null = null;
	private _position2: TimeAndPosition | null = null;
	private _position3: TimeAndPosition | null = null;
	private _position4: TimeAndPosition | null = null;

	private _animationStartPosition: TimeAndPosition | null = null;
	private _durationMsecs: number = 0;
	private _speedPxPerMsec: number = 0;

	private readonly _minMove: number;
	private readonly _minSpeed: number;
	private readonly _maxSpeed: number;
	private readonly _dumpingCoeff: number;

	/**
	 * @param minSpeed 瑙﹀彂鎯€у姩鐢荤殑鏈€浣庨€熷害闃堝€笺€?
	 * @param maxSpeed 闄愬埗璁＄畻閫熷害鐨勪笂闄愶紝闃叉寮傚父绐佸彉銆?
	 * @param dumpingCoeff 闃诲凹绯绘暟锛屽ぇ浜?1锛屽喅瀹氶€熷害琛板噺蹇參銆?
	 * @param minMove 閲囨牱琚涓烘湁鏁堟墍闇€鐨勬渶灏忎綅绉汇€?
	 */
	public constructor(minSpeed: number, maxSpeed: number, dumpingCoeff: number, minMove: number) {
		this._minSpeed = minSpeed;
		this._maxSpeed = maxSpeed;
		this._dumpingCoeff = dumpingCoeff;
		this._minMove = minMove;
	}

	/**
	 * 璁板綍涓€娆℃柊鐨勬嫋鎷介噰鏍凤紝鐢ㄤ簬鍚庣画璁＄畻閫熷害銆?
	 */
	public addPosition(position: Coordinate, time: number): void {
		if (this._position1 !== null) {
			if (this._position1.time === time) {
				this._position1.position = position;
				return;
			}

			if (Math.abs(this._position1.position - position) < this._minMove) {
				return;
			}
		}

		this._position4 = this._position3;
		this._position3 = this._position2;
		this._position2 = this._position1;
		this._position1 = { time, position };
	}

	/**
	 * 鍩轰簬鏈€杩戠殑閲囨牱鐐瑰惎鍔ㄦ儻鎬у姩鐢伙紝璁＄畻琛板噺閫熷害涓庢寔缁椂闂淬€?
	 */
	public start(position: Coordinate, time: number): void {
		if (this._position1 === null || this._position2 === null) {
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (time - this._position1.time > Constants.MaxStartDelay) {
			return;
		}

		// 璁＄畻鍚庣画鍙傛暟涔嬪墠锛岄渶瑕佸厛寰楀埌鍔犳潈鐨勫垵濮嬮€熷害銆?
		let totalDistance = 0;

		const speed1 = speedPxPerMSec(this._position1, this._position2, this._maxSpeed);
		const distance1 = distanceBetweenPoints(this._position1, this._position2);

		// 鎸変綅绉婚暱搴﹁绠楀姞鏉冨钩鍧囬€熷害锛屼綅绉昏秺澶х殑鐗囨鏉冮噸瓒婇珮銆?
		const speedItems = [speed1];
		const distanceItems = [distance1];
		totalDistance += distance1;

		if (this._position3 !== null) {
			const speed2 = speedPxPerMSec(this._position2, this._position3, this._maxSpeed);
			// 鑻ユ柟鍚戝彂鐢熷弽杞紝鍒欒涓烘儻鎬ц鎵撴柇锛屾鍒诲仠姝㈡墿灞曢噰鏍枫€?
			if (Math.sign(speed2) === Math.sign(speed1)) {
				const distance2 = distanceBetweenPoints(this._position2, this._position3);

				speedItems.push(speed2);
				distanceItems.push(distance2);
				totalDistance += distance2;

				if (this._position4 !== null) {
					const speed3 = speedPxPerMSec(this._position3, this._position4, this._maxSpeed);
					if (Math.sign(speed3) === Math.sign(speed1)) {
						const distance3 = distanceBetweenPoints(this._position3, this._position4);

						speedItems.push(speed3);
						distanceItems.push(distance3);
						totalDistance += distance3;
					}
				}
			}
		}

		let resultSpeed = 0;
		for (let i = 0; i < speedItems.length; ++i) {
			resultSpeed += distanceItems[i] / totalDistance * speedItems[i];
		}

		if (Math.abs(resultSpeed) < this._minSpeed) {
			return;
		}

		this._animationStartPosition = { position, time };
		this._speedPxPerMsec = resultSpeed;
		this._durationMsecs = durationMSec(Math.abs(resultSpeed), this._dumpingCoeff);
	}

	/**
	 * 鍦ㄧ粰瀹氭椂闂寸偣寰楀埌鍔ㄧ敾搴斿鐨勪綅缃€?
	 */
	public getPosition(time: number): Coordinate {
		const startPosition = ensureNotNull(this._animationStartPosition);
		const durationMsecs = time - startPosition.time;
		return startPosition.position + this._speedPxPerMsec * (Math.pow(this._dumpingCoeff, durationMsecs) - 1) / (Math.log(this._dumpingCoeff)) as Coordinate;
	}

	/**
	 * 鍒ゆ柇鍔ㄧ敾鏄惁宸茬粡缁撴潫锛堝埌杈鹃浼版寔缁椂闂存垨灏氭湭鍚姩锛夈€?
	 */
	public finished(time: number): boolean {
		return this._animationStartPosition === null || this._progressDuration(time) === this._durationMsecs;
	}

	private _progressDuration(time: number): number {
		const startPosition = ensureNotNull(this._animationStartPosition);
		const progress = time - startPosition.time;
		return Math.min(progress, this._durationMsecs);
	}
}

