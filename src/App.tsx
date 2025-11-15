import './App.css'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import logo from './assets/hp-logo-white.png'

// If you want to focus on a specific substation, set it here.
// Portsmouth substation id provided by user:
const DEFAULT_SUBSTATION_ID = 'faeb353a-94e5-47e5-94dc-92450071434a'

// --- City substation lists (edit as needed) -----------------------------
const PORTSMOUTH_SUBSTATIONS = [
	// user-provided Portsmouth substation
	'faeb353a-94e5-47e5-94dc-92450071434a',
	'2d2348b1-54b7-4a97-a404-193815efbf87',
]

const SOUTHAMPTON_SUBSTATIONS: string[] = [
	// add Southampton substation ids here, e.g. 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
	'dd2fd307-e821-419a-88ae-217b1a0df217',
	'c3048094-3e59-4ce3-8010-254104263ad6',
	'c9d390e3-a3c6-40f6-a5d2-6d5885a066e7',
]

const PORTSMOUTH_POP = 215000
const SOUTHAMPTON_POP = 256000

// Nominal electrical assumptions used to convert current (A) -> power (W):
const NOMINAL_VOLTAGE = 33000 // volts (11 kV typical); change if needed
const POWER_FACTOR = 1 // assumed power factor (1.0 = purely resistive). Adjust as needed.
const SQRT3 = Math.sqrt(3)

type NerdaLocation = {
	name?: string
	energy_kwh?: number // assumption: total energy consumption in kWh
	population?: number
	[key: string]: any
}

function formatNumber(n?: number) {
	if (n == null || Number.isNaN(n)) return 'N/A'
	return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function findLocation(data: any, name: string): NerdaLocation | undefined {
	if (!data) return undefined
	// If data is an object keyed by location
	if (typeof data === 'object' && !Array.isArray(data)) {
		// try direct key
		if ((data as any)[name]) return (data as any)[name]
		// try find by .name
		const values = Object.values(data)
		for (const v of values) {
			const vv = v as any
			if (vv && typeof vv === 'object' && (vv.name === name || vv.location === name)) return vv as NerdaLocation
		}
	}
	// If data is an array of locations
	if (Array.isArray(data)) {
		return data.find((d) => d && (d.name === name || d.location === name)) as NerdaLocation | undefined
	}
	return undefined
}

function perCapita(location?: NerdaLocation) {
	if (!location) return undefined
	const energy = Number(location.energy_kwh ?? location.energy ?? NaN)
	const pop = Number(location.population ?? location.pop ?? NaN)
	if (!isFinite(energy) || !isFinite(pop) || pop === 0) return undefined
	return energy / pop
}

// --- Nerda-after helpers -------------------------------------------------

function findSubstationList(data: any): any[] | undefined {
	if (!data) return undefined
	// Common locations
	if (Array.isArray(data)) {
		// check if this array contains substations (objects with .lines)
		if (data.length && typeof data[0] === 'object' && data[0] != null && ('lines' in data[0] || 'substationId' in data[0])) return data as any[]
	}
	if (typeof data === 'object') {
		const asAny = data as any
		if (Array.isArray(asAny.substations)) return asAny.substations
		if (Array.isArray(asAny.assets)) return asAny.assets
		if (Array.isArray(asAny.locations)) return asAny.locations
		// try to find a nested array with lines
		for (const v of Object.values(asAny)) {
			if (Array.isArray(v) && v.length && typeof v[0] === 'object' && ('lines' in v[0] || 'substationId' in v[0])) return v
		}
	}
	return undefined
}

function getMeasurementIdsFromLine(line: any): Array<{ id: string; unitMultiplier?: string; measurementType?: string }> {
    // Only return measurements explicitly typed as LineCurrent.
    if (!line) return []
    const measurements = (line.measurements ?? line.measurement ?? line.measurementIds ?? []) as any[]
    if (Array.isArray(measurements) && measurements.length) {
        const out: any[] = []
        for (const m of measurements) {
            if (!m) continue
            // static API uses nerda_measurement_id and measurementType
            const id = m.nerda_measurement_id ?? m.id ?? m.measurement_id ?? m.measurementId ?? null
            const mt = m.measurementType ?? m.type ?? null
            const um = m.unitMultiplier ?? m.unit_multiplier ?? m.multiplier ?? null
            if (id && mt) out.push({ id: String(id), unitMultiplier: um, measurementType: mt })
        }
        // Return only those explicitly marked as LineCurrent (case-insensitive).
        const lineCurrents = out.filter((x) => x.measurementType && /linecurrent/i.test(String(x.measurementType)))
        return lineCurrents.length ? lineCurrents : []
    }

    // fallback: look for arrays on any key, but only return entries marked as LineCurrent
    for (const k of Object.keys(line)) {
        const v = (line as any)[k]
        if (Array.isArray(v) && v.length && (v[0].nerda_measurement_id || v[0].measurementType)) {
            const mapped = v
                .map((m: any) => ({ id: String(m.nerda_measurement_id ?? m.id ?? m.measurementId), unitMultiplier: m.unitMultiplier ?? m.unit_multiplier, measurementType: m.measurementType }))
                .filter((m: any) => m.measurementType && /linecurrent/i.test(String(m.measurementType)))
            if (mapped.length) return mapped
        }
    }
    return []
}

async function fetchMeasurementWithFallback(id: string): Promise<any | null> {
	// The Nerda-after endpoint expects: /api/ApiNerdaAfter?measurement=<id>&after=<ISO>
	// Try a sequence of "after" windows (recent first), falling back to epoch if needed.
	const now = Date.now()
	const windows = [
		1 * 60 * 60 * 1000, // 1 hour
		24 * 60 * 60 * 1000, // 24 hours
		7 * 24 * 60 * 60 * 1000, // 7 days
		null // epoch fallback
	]

	for (const w of windows) {
		const after = w == null ? '1970-01-01T00:00:00.000Z' : new Date(now - w).toISOString()
		const url = `/api/ApiNerdaAfter?measurement=${encodeURIComponent(id)}&after=${encodeURIComponent(after)}`
		try {
			const res = await fetch(url)
			if (!res.ok) continue
			const json = await res.json()
			// If the API returns an object/array with content, return it
			if (json && (typeof json === 'object') && (Array.isArray(json) ? json.length > 0 : Object.keys(json).length >= 0)) return json
		} catch (e) {
			// try next
		}
	}
	return null
}

// Fetch measurement data with a specific 'after' timestamp (ISO)
async function fetchMeasurementAfter(id: string, afterISO: string): Promise<any | null> {
	const url = `/api/ApiNerdaAfter?measurement=${encodeURIComponent(id)}&after=${encodeURIComponent(afterISO)}`
	try {
		const res = await fetch(url)
		if (!res.ok) return null
		const json = await res.json()
		return json
	} catch (e) {
		return null
	}
}

function unitMultiplierToFactor(u?: string | null): number {
	if (!u) return 1
	const s = String(u).trim()
	if (!s) return 1
	// Distinguish uppercase M (mega) vs lowercase m (milli)
	if (s === 'M') return 1e6
	const lower = s.toLowerCase()
	if (lower === 'k') return 1e3
	if (lower === 'm') return 1e-3
	if (lower === 'none' || lower === '') return 1
	return 1
}

function extractLineCurrent(obj: any, multiplier = 1): number | undefined {
	if (obj == null) return undefined
	// If object is a primitive number
	if (typeof obj === 'number' && isFinite(obj)) return obj * multiplier
	// Handle Nerda "AnalogValues" shape with value_history (pick most recent timestamp)
	if (typeof obj === 'object' && Array.isArray(obj.AnalogValues) && obj.AnalogValues.length) {
		for (const av of obj.AnalogValues) {
			if (av && Array.isArray(av.value_history) && av.value_history.length) {
				// pick entry with max __ts
				let latest: any = null
				for (const e of av.value_history) {
					if (!e || typeof e.value !== 'number' || !e.__ts) continue
					if (!latest) latest = e
					else if (Date.parse(e.__ts) > Date.parse(latest.__ts)) latest = e
				}
				if (latest && typeof latest.value === 'number') return latest.value * multiplier
			}
			if (av && typeof av.value === 'number') return av.value * multiplier
		}
	}
	// top-level value_history handling
	if (typeof obj === 'object' && Array.isArray(obj.value_history) && obj.value_history.length) {
		let latest: any = null
		for (const e of obj.value_history) {
			if (!e || typeof e.value !== 'number' || !e.__ts) continue
			if (!latest) latest = e
			else if (Date.parse(e.__ts) > Date.parse(latest.__ts)) latest = e
		}
		if (latest && typeof latest.value === 'number') return latest.value * multiplier
	}
	// If the response wraps the value in a common key
	if (typeof obj === 'object') {
		// common keys that carry a measurement value
		const valueKeys = ['value', 'measurement', 'reading', 'measuredValue']
		for (const k of valueKeys) {
			if (k in obj && typeof obj[k] === 'number') return obj[k] * multiplier
			if (k in obj && typeof obj[k] === 'object' && typeof obj[k].value === 'number') return obj[k].value * multiplier
		}

		// look for numeric fields matching current-like names
		for (const k of Object.keys(obj)) {
			const v = obj[k]
			if (typeof v === 'number' && /line.*current|line_current|linecurrent|current/i.test(k)) return v * multiplier
		}

		// if it's an array of readings
		if (Array.isArray(obj.readings) && obj.readings.length) {
			for (const r of obj.readings) {
				const val = extractLineCurrent(r, multiplier)
				if (val != null) return val
			}
		}

		// recursive search
		for (const k of Object.keys(obj)) {
			try {
				const r = extractLineCurrent(obj[k], multiplier)
				if (r != null) return r
			} catch (e) {
				// continue
			}
		}
	}

	// arrays
	if (Array.isArray(obj)) {
		for (const v of obj) {
			const r = extractLineCurrent(v, multiplier)
			if (r != null) return r
		}
	}
	return undefined
}


function App() {
	const query = useQuery({
		queryKey: ['nerda-ssen-static'],
		queryFn: async () => {
			const url = `/api/ApiNerdaStatic${DEFAULT_SUBSTATION_ID ? `?substation=${encodeURIComponent(DEFAULT_SUBSTATION_ID)}` : ''}`
			const response = await fetch(url, { method: 'GET' })
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			const json = await response.json()
			return json
		}
	})

	const data = query.data

	// --- BSP list (paginated) ---------------------------------------
	const bspsQuery = useQuery({
		queryKey: ['nerda-bsps'],
		queryFn: async () => {
			// fetch paginated BSPs: loop offsets until no more results
			const out: Array<{ name: string; UUID: string; latitude?: number }> = []
			let offset = 0
			const pageSize = 30 // endpoint pages are size 30
			while (true) {
				const url = `/api/getpaginatedsub?=&type=BSP&region=england&offset=${offset}`
				try {
					const res = await fetch(url)
					if (!res.ok) break
					const json = await res.json()
					// expect an array of items
					if (!Array.isArray(json) || json.length === 0) break
					for (const it of json) {
						if (it && it.UUID && it.name) out.push({ name: it.name, UUID: it.UUID, latitude: it.latitude })
					}
					// if fewer than pageSize, assume last page
					if (json.length < pageSize) break
					offset += pageSize
				} catch (e) {
					break
				}
			}
			return out
		}
	})

	// selected BSPs for comparison
	const [selectedA, setSelectedA] = useState<string | undefined>(undefined)
	const [selectedB, setSelectedB] = useState<string | undefined>(undefined)

	// compute estimated power for a single BSP UUID, including 24h average
	const computeBspPower = async (uuid?: string) => {
		if (!uuid) return null
		try {
			const res = await fetch(`/api/ApiNerdaStatic?substation=${encodeURIComponent(uuid)}`)
			if (!res.ok) return { error: `HTTP ${res.status}` }
			const sjson = await res.json()
			const subs = findSubstationList(sjson) ?? []
			const sourceSub = Array.isArray(subs) && subs.length ? subs[0] : (subs || sjson)
			const lines = Array.isArray(sourceSub.lines) ? sourceSub.lines : []
			let bspPowerW = 0
			const lineDetails: any[] = []
			// for 24h average
			const afterISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
			let sumPowerEntriesW = 0
			let countPowerEntries = 0
			for (const line of lines) {
				const lineId = line.line_name ?? line.lineId ?? line.id ?? line.name ?? 'unknown-line'
				const meas = getMeasurementIdsFromLine(line)
				let foundCurrent: number | undefined
				let usedMeasurement: string | undefined
				for (const m of meas) {
					// instantaneous (fallback) measurement
					const resp = await fetchMeasurementWithFallback(m.id)
					const factor = unitMultiplierToFactor(m.unitMultiplier)
					const curr = extractLineCurrent(resp, factor)
					if (curr != null) {
						foundCurrent = curr
						usedMeasurement = m.id
						// do not break — still fetch history for 24h average below
					}
					// fetch 24h history for this measurement id and aggregate
					const hist = await fetchMeasurementAfter(m.id, afterISO)
					if (hist) {
						const entries: Array<{ __ts?: string; value?: number }> = []
						if (Array.isArray(hist.AnalogValues)) {
							for (const av of hist.AnalogValues) {
								if (Array.isArray(av.value_history)) {
									for (const e of av.value_history) entries.push(e)
								}
							}
						}
						if (Array.isArray(hist.value_history)) {
							for (const e of hist.value_history) entries.push(e)
						}
						if (!entries.length && typeof hist.value === 'number') {
							entries.push({ __ts: hist.timeStamp ?? hist.timeStamp, value: hist.value })
						}
						for (const e of entries) {
							if (!e || typeof e.value !== 'number' || !e.__ts) continue
							const currentA = Number(e.value) * factor
							const powerW = SQRT3 * NOMINAL_VOLTAGE * currentA * POWER_FACTOR
							sumPowerEntriesW += powerW
							countPowerEntries += 1
						}
					}
				}
				if (foundCurrent != null) {
					const pW = SQRT3 * NOMINAL_VOLTAGE * Number(foundCurrent) * POWER_FACTOR
					bspPowerW += pW
				}
				lineDetails.push({ lineId, foundCurrent, usedMeasurement })
			}
			const avg24hKW = countPowerEntries ? (sumPowerEntriesW / countPowerEntries) / 1000 : null
			return { uuid, bspPowerKW: bspPowerW / 1000, bsp24hAvgKW: avg24hKW, details: lineDetails }
		} catch (e: any) {
			return { error: String(e) }
		}
	}

	const bspAQuery = useQuery({
		queryKey: ['bsp-power', selectedA],
		enabled: !!selectedA,
		queryFn: async () => computeBspPower(selectedA),
	})

	const bspBQuery = useQuery({
		queryKey: ['bsp-power', selectedB],
		enabled: !!selectedB,
		queryFn: async () => computeBspPower(selectedB),
	})
	// Fetch line currents from the Nerda "after" endpoint using measurement ids found in the static data
	const lineCurrentsQuery = useQuery({
		queryKey: ['nerda-after-line-currents'],
		enabled: !!data,
		queryFn: async () => {
			const subs = findSubstationList(data) ?? []
			const out: any[] = []
			for (const sub of subs) {
				const subId = sub.substationId ?? sub.id ?? sub.name ?? sub.substation ?? 'unknown'
				const lines = Array.isArray(sub.lines) ? sub.lines : []
				const lineResults: any[] = []
				for (const line of lines) {
					const lineId = line.lineId ?? line.id ?? line.name ?? 'unknown-line'
					const measIds = getMeasurementIdsFromLine(line)
					let foundCurrent: number | undefined = undefined
					let usedMeasurement: string | undefined = undefined
					let raw: any = null
					for (const meas of measIds) {
						const m = await fetchMeasurementWithFallback(meas.id)
						raw = m
						const factor = unitMultiplierToFactor(meas.unitMultiplier)
						const curr = extractLineCurrent(m, factor)
						if (curr != null) {
							foundCurrent = curr
							usedMeasurement = meas.id
							break
						}
					}
					lineResults.push({ lineId, foundCurrent, usedMeasurement, raw })
				}
				out.push({ subId, lines: lineResults })
			}
			return out
		}
	})

	// Compute city totals based on lists of substations and latest LineCurrent per line.
	const cityPowerQuery = useQuery({
		queryKey: ['city-powers', PORTSMOUTH_SUBSTATIONS, SOUTHAMPTON_SUBSTATIONS],
		// only run after V1 static data is loaded (so proxy/auth available)
		enabled: true,
		queryFn: async () => {
			const computeForList = async (ids: string[]) => {
				let cityPowerW = 0
				const details: any[] = []
				for (const sid of ids) {
					// fetch the static metadata for this substation
					try {
						const res = await fetch(`/api/ApiNerdaStatic?substation=${encodeURIComponent(sid)}`)
						if (!res.ok) {
							details.push({ subId: sid, error: `HTTP ${res.status}` })
							continue
						}
						const sjson = await res.json()
						const subs = findSubstationList(sjson) ?? []
						// static payload may return an array with one substation
						const sourceSub = Array.isArray(subs) && subs.length ? subs[0] : (subs || sjson)
						const lines = Array.isArray(sourceSub.lines) ? sourceSub.lines : []
						let subPowerW = 0
						const lineDetails: any[] = []
						for (const line of lines) {
							const lineId = line.line_name ?? line.lineId ?? line.id ?? line.name ?? 'unknown-line'
							const meas = getMeasurementIdsFromLine(line)
							let foundCurrent: number | undefined
							let usedMeasurement: string | undefined
							for (const m of meas) {
								const resp = await fetchMeasurementWithFallback(m.id)
								const factor = unitMultiplierToFactor(m.unitMultiplier)
								const curr = extractLineCurrent(resp, factor)
								if (curr != null) {
									foundCurrent = curr
									usedMeasurement = m.id
									break
								}
							}
							if (foundCurrent != null) {
								// P (W) = sqrt(3) * V * I * PF
								const pW = SQRT3 * NOMINAL_VOLTAGE * Number(foundCurrent) * POWER_FACTOR
								subPowerW += pW
							}
							lineDetails.push({ lineId, foundCurrent, usedMeasurement })
						}
					cityPowerW += subPowerW
					details.push({ subId: sid, subPowerKW: subPowerW / 1000, lines: lineDetails })
				} catch (e: any) {
					details.push({ subId: sid, error: String(e) })
				}
				}
				return { cityPowerKW: cityPowerW / 1000, cityEnergyPerHourKWh: cityPowerW / 1000, details }
			}

			const port = await computeForList(PORTSMOUTH_SUBSTATIONS)
			const south = await computeForList(SOUTHAMPTON_SUBSTATIONS)
			return { port, south }
		}
	})

// --- 24h timeseries -----------------------------------------------------
const cityTimeseriesQuery = useQuery({
	queryKey: ['city-timeseries', PORTSMOUTH_SUBSTATIONS, SOUTHAMPTON_SUBSTATIONS],
	enabled: true,
	queryFn: async () => {
		const afterISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

		const aggregateForList = async (ids: string[]) => {
			const tsMap: Record<string, number> = {}
			for (const sid of ids) {
				try {
					const res = await fetch(`/api/ApiNerdaStatic?substation=${encodeURIComponent(sid)}`)
					if (!res.ok) continue
					const sjson = await res.json()
					const subs = findSubstationList(sjson) ?? []
					const sourceSub = Array.isArray(subs) && subs.length ? subs[0] : (subs || sjson)
					const lines = Array.isArray(sourceSub.lines) ? sourceSub.lines : []
					for (const line of lines) {
						const meas = getMeasurementIdsFromLine(line)
						for (const m of meas) {
							const hist = await fetchMeasurementAfter(m.id, afterISO)
							if (!hist) continue
							// extract history entries: prefer AnalogValues[].value_history or top-level value_history
							const entries: Array<{ __ts?: string; value?: number }> = []
							if (Array.isArray(hist.AnalogValues)) {
								for (const av of hist.AnalogValues) {
									if (Array.isArray(av.value_history)) {
										for (const e of av.value_history) entries.push(e)
									}
								}
							}
							if (Array.isArray(hist.value_history)) {
								for (const e of hist.value_history) entries.push(e)
							}
							// if none, but top-level value present, use it with timestamp from hist.timeStamp
							if (!entries.length && typeof hist.value === 'number') {
								entries.push({ __ts: hist.timeStamp ?? hist.timeStamp, value: hist.value })
							}

							const factor = unitMultiplierToFactor(m.unitMultiplier)
							for (const e of entries) {
								if (!e || typeof e.value !== 'number' || !e.__ts) continue
								const currentA = Number(e.value) * factor
								const powerW = SQRT3 * NOMINAL_VOLTAGE * currentA * POWER_FACTOR
								tsMap[e.__ts] = (tsMap[e.__ts] ?? 0) + powerW
							}
						}
					}
				} catch (e) {
					// ignore substation failures
				}
			}
			// build sorted series
			const series = Object.keys(tsMap)
				.map((k) => ({ ts: Date.parse(k), valueKW: tsMap[k] / 1000 }))
				.filter((s) => !Number.isNaN(s.ts))
				.sort((a, b) => a.ts - b.ts)
			return series
		}

		const portSeries = await aggregateForList(PORTSMOUTH_SUBSTATIONS)
		const southSeries = await aggregateForList(SOUTHAMPTON_SUBSTATIONS)
		return { portSeries, southSeries }
	}
})

	const southampton = findLocation(data, 'Southampton')
	const portsmouth = findLocation(data, 'Portsmouth')

	const southPer = perCapita(southampton)
	const portPer = perCapita(portsmouth)

	return (
		<div style={{ padding: 24 }}>
			<img
				src={logo}
				alt="Hack Pompey"
				style={{ width: 200, height: 'auto', display: 'block', margin: '0 auto 24px auto' }}
			/>
			<h1>SSEN — energy consumption comparison</h1>

			{/* City power summary (moved to top) */}
			<div style={{ marginTop: 28 }}>
				<h2>Portsmouth VS Southampton - who is more energy efficient?</h2>
				{cityPowerQuery.isLoading && <div>Computing city power...</div>}
				{cityPowerQuery.isError && <div style={{ color: 'crimson' }}>Error computing city power: {(cityPowerQuery.error as Error)?.message ?? String(cityPowerQuery.error)}</div>}
				{!cityPowerQuery.isLoading && !cityPowerQuery.isError && cityPowerQuery.data && (
					<div>
						{/** compute 24h averages once to reuse in the table and per-person calcs */}
						{(() => {
							const portSeries = cityTimeseriesQuery.data?.portSeries ?? [] as any[]
							const southSeries = cityTimeseriesQuery.data?.southSeries ?? [] as any[]
							const port24hAvg = (portSeries.reduce((s: number, p: any) => s + (p.valueKW ?? 0), 0) ?? 0) / Math.max(1, portSeries.length)
							const south24hAvg = (southSeries.reduce((s: number, p: any) => s + (p.valueKW ?? 0), 0) ?? 0) / Math.max(1, southSeries.length)
							return (
								<>
									{/* expose computed values to the JSX below via closure */}
									{/* @ts-ignore */}
									<div style={{ display: 'none' }} data-port24avg={port24hAvg} data-south24avg={south24hAvg} />
								</>
							)
						})()}
						<table style={{ width: '100%', maxWidth: 700, borderCollapse: 'collapse', margin: '0 auto' }}>
							<thead>
								<tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
									<th>City</th>
									<th>Estimated power (kW)</th>
									<th>24h avg (kW)</th>
									<th>Estimated energy / hour (kWh)</th>
									<th>kW per person</th>
									<th>W per person</th>
									<th>24h avg kW/person</th>
									<th>24h avg W/person</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td>Portsmouth</td>
									<td>{formatNumber(cityPowerQuery.data.port.cityPowerKW)}</td>
									<td>{formatNumber((cityTimeseriesQuery.data?.portSeries?.reduce((s: number, p: any) => s + (p.valueKW ?? 0), 0) ?? 0) / Math.max(1, (cityTimeseriesQuery.data?.portSeries?.length ?? 0)))}</td>
									<td>{formatNumber(cityPowerQuery.data.port.cityEnergyPerHourKWh)}</td>
									<td>{formatNumber((cityPowerQuery.data.port.cityPowerKW ?? 0) / (PORTSMOUTH_POP || 1))}</td>
									<td>{formatNumber(((cityPowerQuery.data.port.cityPowerKW ?? 0) * 1000) / (PORTSMOUTH_POP || 1))}</td>
									<td>{formatNumber(((cityTimeseriesQuery.data?.portSeries?.reduce((s: number, p: any) => s + (p.valueKW ?? 0), 0) ?? 0) / Math.max(1, (cityTimeseriesQuery.data?.portSeries?.length ?? 0))) / (PORTSMOUTH_POP || 1))}</td>
									<td>{formatNumber((((cityTimeseriesQuery.data?.portSeries?.reduce((s: number, p: any) => s + (p.valueKW ?? 0), 0) ?? 0) / Math.max(1, (cityTimeseriesQuery.data?.portSeries?.length ?? 0))) * 1000) / (PORTSMOUTH_POP || 1))}</td>
								</tr>
								<tr>
									<td>Southampton</td>
									<td>{formatNumber(cityPowerQuery.data.south.cityPowerKW)}</td>
									<td>{formatNumber((cityTimeseriesQuery.data?.southSeries?.reduce((s: number, p: any) => s + (p.valueKW ?? 0), 0) ?? 0) / Math.max(1, (cityTimeseriesQuery.data?.southSeries?.length ?? 0)))}</td>
									<td>{formatNumber(cityPowerQuery.data.south.cityEnergyPerHourKWh)}</td>
									<td>{formatNumber((cityPowerQuery.data.south.cityPowerKW ?? 0) / (SOUTHAMPTON_POP || 1))}</td>
									<td>{formatNumber(((cityPowerQuery.data.south.cityPowerKW ?? 0) * 1000) / (SOUTHAMPTON_POP || 1))}</td>
									<td>{formatNumber(((cityTimeseriesQuery.data?.southSeries?.reduce((s: number, p: any) => s + (p.valueKW ?? 0), 0) ?? 0) / Math.max(1, (cityTimeseriesQuery.data?.southSeries?.length ?? 0))) / (SOUTHAMPTON_POP || 1))}</td>
									<td>{formatNumber((((cityTimeseriesQuery.data?.southSeries?.reduce((s: number, p: any) => s + (p.valueKW ?? 0), 0) ?? 0) / Math.max(1, (cityTimeseriesQuery.data?.southSeries?.length ?? 0))) * 1000) / (SOUTHAMPTON_POP || 1))}</td>
								</tr>
							</tbody>
						</table>

						<details style={{ marginTop: 12 }}>
							<summary>Per-substation breakdown</summary>
							<pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto' }}>{JSON.stringify(cityPowerQuery.data, null, 2)}</pre>
							</details>
					</div>
				)}
			</div>





				{/* BSP comparison controls */}
				<div style={{ marginTop: 20, maxWidth: 800, marginLeft: 'auto', marginRight: 'auto' }}>
					<h2>Compare BSPs</h2>
					{bspsQuery.isLoading && <div>Loading BSP list...</div>}
					{bspsQuery.isError && <div style={{ color: 'crimson' }}>Error loading BSPs: {(bspsQuery.error as Error)?.message ?? String(bspsQuery.error)}</div>}
					{!bspsQuery.isLoading && !bspsQuery.isError && Array.isArray(bspsQuery.data) && (
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
							<div>
								<label>Select BSP A</label>
								<br />
								<select value={selectedA ?? ''} onChange={(e) => setSelectedA(e.target.value || undefined)} style={{ width: '100%', padding: 6 }}>
									<option value="">-- choose BSP --</option>
									{bspsQuery.data.map((b: any) => (
										<option key={b.UUID} value={b.UUID}>{b.name} — {b.UUID}</option>
									))}
								</select>
								{bspAQuery.isLoading && <div>Computing BSP A power...</div>}
								{bspAQuery.isError && <div style={{ color: 'crimson' }}>Error: {(bspAQuery.error as Error)?.message ?? String(bspAQuery.error)}</div>}
								{bspAQuery.data && (
									<div style={{ marginTop: 8 }}>
										<strong>A:</strong> {bspsQuery.data.find((x: any) => x.UUID === selectedA)?.name ?? selectedA}
										<div>Estimated power: {bspAQuery.data.bspPowerKW != null ? formatNumber(bspAQuery.data.bspPowerKW) + ' kW' : 'N/A'}</div>
										<div>Estimated 24h avg: {bspAQuery.data.bsp24hAvgKW != null ? formatNumber(bspAQuery.data.bsp24hAvgKW) + ' kW' : 'N/A'}</div>
										<details>
											<summary>Per-line details</summary>
											<pre style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>{JSON.stringify(bspAQuery.data.details, null, 2)}</pre>
											</details>
									</div>
								)}
							</div>
							<div>
								<label>Select BSP B</label>
								<br />
								<select value={selectedB ?? ''} onChange={(e) => setSelectedB(e.target.value || undefined)} style={{ width: '100%', padding: 6 }}>
									<option value="">-- choose BSP --</option>
									{bspsQuery.data.map((b: any) => (
										<option key={b.UUID} value={b.UUID}>{b.name} — {b.UUID}</option>
									))}
								</select>
								{bspBQuery.isLoading && <div>Computing BSP B power...</div>}
								{bspBQuery.isError && <div style={{ color: 'crimson' }}>Error: {(bspBQuery.error as Error)?.message ?? String(bspBQuery.error)}</div>}
								{bspBQuery.data && (
									<div style={{ marginTop: 8 }}>
										<strong>B:</strong> {bspsQuery.data.find((x: any) => x.UUID === selectedB)?.name ?? selectedB}
										<div>Estimated power: {bspBQuery.data.bspPowerKW != null ? formatNumber(bspBQuery.data.bspPowerKW) + ' kW' : 'N/A'}</div>
										<div>Estimated 24h avg: {bspBQuery.data.bsp24hAvgKW != null ? formatNumber(bspBQuery.data.bsp24hAvgKW) + ' kW' : 'N/A'}</div>
										<details>
											<summary>Per-line details</summary>
											<pre style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>{JSON.stringify(bspBQuery.data.details, null, 2)}</pre>
											</details>
									</div>
								)}
							</div>
						</div>
					)}
					{bspAQuery.data && bspBQuery.data && (
						<div style={{ marginTop: 12 }}>
							<h3>Comparison</h3>
							<p>
								A: {formatNumber(bspAQuery.data.bspPowerKW ?? 0)} kW — B: {formatNumber(bspBQuery.data.bspPowerKW ?? 0)} kW
							</p>
							<p>Difference (A − B): {formatNumber((bspAQuery.data.bspPowerKW ?? 0) - (bspBQuery.data.bspPowerKW ?? 0))} kW</p>
							<p>
								24h avg A: {formatNumber(bspAQuery.data.bsp24hAvgKW ?? 0)} kW — 24h avg B: {formatNumber(bspBQuery.data.bsp24hAvgKW ?? 0)} kW
							</p>
							<p>24h avg difference (A − B): {formatNumber((bspAQuery.data.bsp24hAvgKW ?? 0) - (bspBQuery.data.bsp24hAvgKW ?? 0))} kW</p>
						</div>
					)}
				</div>

		</div>
	)
}

export default App
