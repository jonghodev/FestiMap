// Kakao Map JavaScript SDK type definitions
declare namespace kakao {
  namespace maps {
    // Core
    function load(callback: () => void): void;

    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    class LatLngBounds {
      constructor(sw?: LatLng, ne?: LatLng);
      extend(latlng: LatLng): void;
      getSouthWest(): LatLng;
      getNorthEast(): LatLng;
      isEmpty(): boolean;
    }

    interface MapOptions {
      center: LatLng;
      level: number;
      mapTypeId?: MapTypeId;
      draggable?: boolean;
      scrollwheel?: boolean;
      disableDoubleClick?: boolean;
      disableDoubleClickZoom?: boolean;
      projectionId?: string;
      tileAnimation?: boolean;
      keyboardShortcuts?: boolean | { speed: number };
    }

    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      setCenter(latlng: LatLng): void;
      getCenter(): LatLng;
      setLevel(level: number, options?: { animate?: boolean; anchor?: LatLng }): void;
      getLevel(): number;
      setMapTypeId(mapTypeId: MapTypeId): void;
      setBounds(bounds: LatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number): void;
      getBounds(): LatLngBounds;
      panBy(x: number, y: number): void;
      panTo(latlng: LatLng | LatLngBounds): void;
      addOverlayMapTypeId(mapTypeId: MapTypeId): void;
      removeOverlayMapTypeId(mapTypeId: MapTypeId): void;
      relayout(): void;
      getProjection(): Projection;
    }

    enum MapTypeId {
      ROADMAP = 1,
      SKYVIEW = 2,
      HYBRID = 3,
      OVERLAY = 4,
      ROADVIEW = 5,
      TRAFFIC = 6,
      TERRAIN = 7,
      BICYCLE = 8,
      BICYCLE_HYBRID = 9,
      USE_DISTRICT = 10,
    }

    interface MarkerOptions {
      map?: Map;
      position: LatLng;
      image?: MarkerImage;
      title?: string;
      draggable?: boolean;
      clickable?: boolean;
      zIndex?: number;
      opacity?: number;
      altitude?: number;
      range?: number;
    }

    class Marker {
      constructor(options?: MarkerOptions);
      setMap(map: Map | null): void;
      getMap(): Map | null;
      setImage(image: MarkerImage): void;
      getImage(): MarkerImage;
      setPosition(position: LatLng): void;
      getPosition(): LatLng;
      setZIndex(zIndex: number): void;
      getZIndex(): number;
      setTitle(title: string): void;
      getTitle(): string;
      setDraggable(draggable: boolean): void;
      getDraggable(): boolean;
      setClickable(clickable: boolean): void;
      getClickable(): boolean;
      setOpacity(opacity: number): void;
      getOpacity(): number;
    }

    interface MarkerImageOptions {
      alt?: string;
      coords?: string;
      offset?: Point;
      shape?: string;
      spriteOrigin?: Point;
      spriteSize?: Size;
    }

    class MarkerImage {
      constructor(src: string, size: Size, options?: MarkerImageOptions);
    }

    class Point {
      constructor(x: number, y: number);
      getX(): number;
      getY(): number;
      equals(point: Point): boolean;
      toString(): string;
    }

    class Size {
      constructor(width: number, height: number);
      getWidth(): number;
      getHeight(): number;
      equals(size: Size): boolean;
      toString(): string;
    }

    interface InfoWindowOptions {
      content?: string | HTMLElement;
      disableAutoPan?: boolean;
      maxWidth?: number;
      position?: LatLng;
      removable?: boolean;
      zIndex?: number;
    }

    class InfoWindow {
      constructor(options?: InfoWindowOptions);
      open(map: Map, marker?: Marker): void;
      close(): void;
      getMap(): Map | null;
      setPosition(position: LatLng): void;
      getPosition(): LatLng;
      setContent(content: string | HTMLElement): void;
      getContent(): string | HTMLElement;
      setZIndex(zIndex: number): void;
      getZIndex(): number;
    }

    class CustomOverlay {
      constructor(options: {
        map?: Map;
        position: LatLng;
        content: string | HTMLElement;
        xAnchor?: number;
        yAnchor?: number;
        zIndex?: number;
        clickable?: boolean;
      });
      setMap(map: Map | null): void;
      getMap(): Map | null;
      setPosition(position: LatLng): void;
      getPosition(): LatLng;
      setContent(content: string | HTMLElement): void;
      getContent(): string | HTMLElement;
      setZIndex(zIndex: number): void;
      getZIndex(): number;
      setAltitude(altitude: number): void;
      getAltitude(): number;
      setRange(range: number): void;
      getRange(): number;
    }

    interface Projection {
      pointFromCoords(latlng: LatLng): Point;
      coordsFromPoint(point: Point): LatLng;
      containerPointFromCoords(latlng: LatLng): Point;
      coordsFromContainerPoint(point: Point): LatLng;
    }

    namespace event {
      function addListener(
        target: Map | Marker | CustomOverlay,
        type: string,
        handler: (event?: MouseEvent | DragEvent) => void
      ): void;
      function removeListener(
        target: Map | Marker | CustomOverlay,
        type: string,
        handler: (event?: MouseEvent | DragEvent) => void
      ): void;
      function trigger(
        target: Map | Marker | CustomOverlay,
        type: string,
        data?: object
      ): void;
      function preventMap(): void;
    }

    interface MouseEvent {
      latLng: LatLng;
      point: Point;
    }

    interface DragEvent {
      latLng: LatLng;
      point: Point;
    }
  }
}

interface Window {
  kakao: typeof kakao;
}
