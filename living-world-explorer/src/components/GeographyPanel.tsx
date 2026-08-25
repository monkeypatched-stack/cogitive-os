import { PanelContainer } from './PanelContainer'
import { WorldTree } from './worldTree/WorldTree'

export function GeographyPanel() {
  return <PanelContainer title="Geography"><WorldTree geographyOnly /></PanelContainer>
}
