import { useState } from 'react'
import { searchAddress, parseAddressComponents, extractPolygon, type GeocodeResult } from '../../api/geocodeClient'
import { useWorldStore } from '../../store/worldStore'
import './AddressSearch.css'

/**
 * Real address search (OpenStreetMap Nominatim, no API key) — distinct
 * from the plain name-filter box above it, which only filters entities
 * already loaded. This one reaches out to the real world: a result
 * selected here becomes a real Building, with a real WorldLocation, in
 * the actual backend (POST /planet/geo/from-address) — not a preview,
 * not a mock.
 */
export function AddressSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'creating' | 'error'>('idle')
  const [error, setError] = useState('')
  const createFromAddress = useWorldStore((s) => s.createFromAddress)

  const runSearch = async () => {
    if (!query.trim()) return
    setStatus('searching')
    setError('')
    try {
      const found = await searchAddress(query)
      setResults(found)
      setStatus('idle')
      if (found.length === 0) setError(`No results for "${query}".`)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const pickResult = async (result: GeocodeResult) => {
    setStatus('creating')
    setError('')
    try {
      const parsed = parseAddressComponents(result)
      if (!parsed.country) {
        throw new Error('This result has no country in its address breakdown — cannot place it in the hierarchy.')
      }
      // Real footprint only when Nominatim actually mapped one (a way/
      // relation result) — extractPolygon returns null for a plain
      // point address, and we send nothing rather than a fabricated
      // shape in that case.
      const polygon = extractPolygon(result)
      await createFromAddress({
        country: parsed.country,
        state: parsed.state,
        county: parsed.county,
        city: parsed.city,
        street: parsed.street,
        building_name: parsed.buildingName,
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        display_address: result.display_name,
        attributes: polygon ? { polygon } : undefined,
      })
      setResults([])
      setQuery('')
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="lwe-address-search">
      <div className="lwe-address-search-row">
        <input
          type="search"
          placeholder="Add a real address..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runSearch()
          }}
          aria-label="Search for a real address"
        />
        <button type="button" onClick={runSearch} disabled={status === 'searching' || status === 'creating'}>
          {status === 'searching' ? '...' : 'Search'}
        </button>
      </div>

      {error && <div className="lwe-address-search-error">{error}</div>}

      {results.length > 0 && (
        <ul className="lwe-address-search-results">
          {results.map((result) => (
            <li key={result.place_id}>
              <button
                type="button"
                disabled={status === 'creating'}
                onClick={() => pickResult(result)}
              >
                {result.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === 'creating' && <div className="lwe-address-search-status">Creating from address...</div>}
    </div>
  )
}
