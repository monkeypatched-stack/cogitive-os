import { PanelContainer } from './PanelContainer'
import { MapView } from './map/MapView'

export function MapPanel() {
  return (
    <PanelContainer title="Map">
      <MapView />
    </PanelContainer>
  )
}
