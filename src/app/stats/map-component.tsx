"use client";

import { useMemo, useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import {
  Feature,
  GeoJsonProperties,
  Geometry,
  FeatureCollection,
} from "geojson";
import { Layer, PathOptions, Control, DomUtil, DomEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import { scaleLinear } from "d3-scale";
import worldCountries from "@/../public/world-countries.json";

const COLORS = {
  GRADIENT_START: "#0a090b",
  GRADIENT_END: "#7C3AED",
  BORDER: "#401350",
  EMPTY_COUNTRY: "#280d33",
} as const;

interface MapPoint {
  country_code: string;
  count: number;
  name: string;
}

interface MapComponentProps {
  points: MapPoint[];
}

class LegendControl extends Control {
  private min: number;
  private max: number;

  constructor(min: number, max: number) {
    super({ position: "bottomright" });
    this.min = min;
    this.max = max;
  }

  onAdd() {
    const div = DomUtil.create(
      "div",
      "leaflet-control bg-black/80 p-4 rounded-lg border border-purple-500/20 text-sm text-purple-100",
    );
    div.innerHTML = `
      <div class="mb-2 font-medium">Increments</div>
      <div class="flex flex-col gap-1">
        <div class="w-48 h-4 rounded" style="background: linear-gradient(to right, ${COLORS.GRADIENT_START}, ${COLORS.GRADIENT_END})"></div>
        <div class="flex justify-between w-full px-1">
          <span>${this.min.toLocaleString()}</span>
          <span>${this.max.toLocaleString()}</span>
        </div>
      </div>
    `;

    DomEvent.disableClickPropagation(div);
    return div;
  }
}

function Legend({ min, max }: { min: number; max: number }) {
  const map = useMap();

  useEffect(() => {
    const legend = new LegendControl(min, max);
    map.addControl(legend);
    return () => {
      map.removeControl(legend);
    };
  }, [map, min, max]);

  return null;
}

export default function MapComponent({ points }: MapComponentProps) {
  const maxCount = useMemo(() => {
    return Math.max(...points.map((p) => p.count), 1);
  }, [points]);

  const colorScale = scaleLinear<string>()
    .domain([0, maxCount])
    .range([COLORS.GRADIENT_START, COLORS.GRADIENT_END]);

  const style = (
    feature: Feature<Geometry, GeoJsonProperties> | undefined,
  ): PathOptions => {
    if (!feature)
      return {
        fillColor: COLORS.EMPTY_COUNTRY,
        weight: 1,
        opacity: 1,
        color: COLORS.BORDER,
        fillOpacity: 0.7,
      };
    const countryCode =
      feature.properties?.ISO_A2 || feature.properties?.ISO_A3;
    const countryData = points.find((p) => p.country_code === countryCode);
    const count = countryData?.count || 0;
    return {
      fillColor: colorScale(count),
      weight: 1,
      opacity: 1,
      color: "#1E293B",
      fillOpacity: 0.7,
    };
  };

  const onEachFeature = (
    feature: Feature<Geometry, GeoJsonProperties>,
    layer: Layer,
  ) => {
    const countryCode =
      feature.properties?.ISO_A2 || feature.properties?.ISO_A3;
    const countryData = points.find((p) => p.country_code === countryCode);
    const tooltipContent = countryData
      ? `${countryData.name}: ${countryData.count.toLocaleString()} increments`
      : feature.properties?.ADMIN || feature.properties?.NAME;

    layer.bindTooltip(tooltipContent || "", {
      permanent: false,
      direction: "top",
      className:
        "bg-black/90 border border-purple-500/20 text-purple-100 px-4 py-2 rounded-lg shadow-lg text-sm",
    });
  };

  return (
    <div className="w-full h-full bg-black">
      <MapContainer
        center={[20, 0]}
        zoom={1.3}
        minZoom={1}
        maxZoom={8}
        scrollWheelZoom={true}
        zoomControl={true}
        worldCopyJump={true}
        className="bg-black h-full w-full"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <GeoJSON
          data={worldCountries as unknown as FeatureCollection}
          style={style}
          onEachFeature={onEachFeature}
        />
        <Legend min={0} max={maxCount} />
      </MapContainer>
    </div>
  );
}
