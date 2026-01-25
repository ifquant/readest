// 根据柱间距和像素比估算理想柱宽
export function optimalBarWidth(barSpacing: number, pixelRatio: number): number {
	return Math.floor(barSpacing * 0.3 * pixelRatio);
}

// 根据柱间距和像素比估算理想蜡烛宽度
export function optimalCandlestickWidth(barSpacing: number, pixelRatio: number): number {
	const barSpacingSpecialCaseFrom = 2.5;
	const barSpacingSpecialCaseTo = 4;
	const barSpacingSpecialCaseCoeff = 3;
	// 在特定区间内使用固定系数，保证效果
	if (barSpacing >= barSpacingSpecialCaseFrom && barSpacing <= barSpacingSpecialCaseTo) {
		return Math.floor(barSpacingSpecialCaseCoeff * pixelRatio);
	}
	// coeff should be 1 on small barspacing and go to 0.8 while groing bar spacing
	// 柱间距较小时系数为 1，随着柱间距增大逐渐降低至 0.8
	const barSpacingReducingCoeff = 0.2;
	const coeff = 1 - barSpacingReducingCoeff * Math.atan(Math.max(barSpacingSpecialCaseTo, barSpacing) - barSpacingSpecialCaseTo) / (Math.PI * 0.5);
	const res = Math.floor(barSpacing * coeff * pixelRatio);
	const scaledBarSpacing = Math.floor(barSpacing * pixelRatio);
	const optimal = Math.min(res, scaledBarSpacing);
	return Math.max(Math.floor(pixelRatio), optimal);
}
