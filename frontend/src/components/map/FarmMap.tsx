'use client'
import { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Animal, Zone, KeyPoint, GPSPayload, WSEvent } from '@/types'
import { useWebSocket } from '@/hooks/useWebSocket'

// Free satellite + OSM hybrid style (no token required)
const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '© Esri, Maxar, Earthstar Geographics',
    },
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'satellite', type: 'raster', source: 'satellite' },
    { id: 'osm-labels', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.25 } },
  ],
}

interface FarmMapProps {
  farmId: string
  animals: Animal[]
  zones: Zone[]
  keyPoints: KeyPoint[]
  activeHerdFilter?: string | null
}

const ANIMAL_LAYER = 'animals-layer'
const ANIMAL_SOURCE = 'animals'
const ZONES_LAYER = 'zones-fill'
const ZONES_OUTLINE = 'zones-outline'
const ZONES_SOURCE = 'zones'

// Brazil (MS) center
const DEFAULT_CENTER: [number, number] = [-55.0, -20.2]
const DEFAULT_ZOOM = 12

export default function FarmMap({ farmId, animals, zones, keyPoints, activeHerdFilter }: FarmMapProps) {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleGPSUpdate = useCallback((event: WSEvent) => {
    const p = event.payload as GPSPayload
    const map = mapRef.current
    if (!map) return
    const source = map.getSource(ANIMAL_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (!source) return
    const data = (source as any)._data as GeoJSON.FeatureCollection
    if (!data?.features) return
    const feature = data.features.find((f) => f.properties?.id === p.animal_id)
    if (feature && feature.geometry.type === 'Point') {
      feature.geometry.coordinates = [p.lng, p.lat]
      source.setData(data)
    }
  }, [])

  useWebSocket({ farmId, onGPSUpdate: handleGPSUpdate, enabled: !!farmId })

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Auto-center on animals if any have GPS
    const withGPS = animals.filter((a) => a.last_location)
    const center: [number, number] =
      withGPS.length > 0
        ? [
            (withGPS[0].last_location as GeoJSON.Point).coordinates[0] as number,
            (withGPS[0].last_location as GeoJSON.Point).coordinates[1] as number,
          ]
        : DEFAULT_CENTER

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center,
      zoom: DEFAULT_ZOOM,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')

    map.on('load', () => {
      // ---- Zones ----
      map.addSource(ZONES_SOURCE, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: zones.map((z) => ({
            type: 'Feature' as const,
            properties: {
              id: z.id,
              name: z.name,
              area_ha: z.area_ha,
              animal_count: z.animal_count ?? 0,
            },
            geometry: z.geometry,
          })),
        },
      })

      map.addLayer({
        id: ZONES_LAYER,
        type: 'fill',
        source: ZONES_SOURCE,
        paint: {
          'fill-color': [
            'case',
            ['>', ['get', 'animal_count'], 0], 'rgba(34,197,94,0.25)',
            'rgba(255,255,255,0.1)',
          ],
          'fill-outline-color': 'rgba(34,197,94,0.8)',
        },
      })

      map.addLayer({
        id: ZONES_OUTLINE,
        type: 'line',
        source: ZONES_SOURCE,
        paint: {
          'line-color': '#16a34a',
          'line-width': 2,
          'line-dasharray': [2, 1],
        },
      })

      map.on('click', ZONES_LAYER, (e) => {
        const props = e.features?.[0]?.properties
        if (!props) return
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="padding:8px;font-size:13px;">
              <strong>${props.name}</strong><br/>
              ${props.area_ha} ha · ${props.animal_count} animais
            </div>
          `)
          .addTo(map)
      })

      // ---- Animals ----
      const filteredAnimals = activeHerdFilter
        ? animals.filter((a) => a.herd_id === activeHerdFilter)
        : animals

      map.addSource(ANIMAL_SOURCE, {
        type: 'geojson',
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 40,
        data: {
          type: 'FeatureCollection',
          features: filteredAnimals
            .filter((a) => a.last_location)
            .map((a) => ({
              type: 'Feature' as const,
              properties: {
                id: a.id,
                name: a.name ?? a.ear_tag,
                herd_color: a.herd_color ?? '#22c55e',
                last_seen: a.last_seen_at,
              },
              geometry: a.last_location!,
            })),
        },
      })

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: ANIMAL_SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#16a34a',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 30],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      })

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: ANIMAL_SOURCE,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
        },
        paint: { 'text-color': '#fff' },
      })

      map.addLayer({
        id: ANIMAL_LAYER,
        type: 'circle',
        source: ANIMAL_SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'herd_color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      })

      map.on('click', ANIMAL_LAYER, (e) => {
        const props = e.features?.[0]?.properties
        if (!props) return
        const coords = (e.features![0].geometry as GeoJSON.Point).coordinates as [number, number]
        new maplibregl.Popup({ offset: 10 })
          .setLngLat(coords)
          .setHTML(`
            <div style="padding:8px;font-size:13px;">
              <p style="font-weight:600;margin:0 0 4px">${props.name}</p>
              <p style="color:#6b7280;font-size:11px;margin:0 0 4px">
                ${props.last_seen ? 'Visto ' + new Date(props.last_seen).toLocaleString('pt-BR') : 'Sem dados GPS'}
              </p>
              <a href="/animals/${props.id}" style="color:#16a34a;font-size:11px;">Ver ficha →</a>
            </div>
          `)
          .addTo(map)
      })

      map.on('mouseenter', ANIMAL_LAYER, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', ANIMAL_LAYER, () => { map.getCanvas().style.cursor = '' })

      // ---- Key points ----
      keyPoints.forEach((kp) => {
        new maplibregl.Marker({ color: '#f97316' })
          .setLngLat((kp.location as GeoJSON.Point).coordinates as [number, number])
          .setPopup(new maplibregl.Popup().setText(kp.name))
          .addTo(map)
      })
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line

  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />
}
