import type { Scenario, SimState } from '../model/types'

export type ResourceIdentity = {
  id: string
  name: string
  institutionId?: string
  ownerOperatorId?: string
}

export type ScenarioIdentities = {
  demandOperatorId: string
  supplyOperatorId: string
  cards: Record<string, ResourceIdentity>
  pos: Record<string, ResourceIdentity>
  simulation: boolean
}

export function identitiesFromScenario(scenario: Scenario, state: SimState): ScenarioIdentities {
  const fixtures = scenario.slice0Fixtures
  const cards: ScenarioIdentities['cards'] = {}
  const pos: ScenarioIdentities['pos'] = {}
  for (const card of state.cards) {
    cards[card.id] = {
      id: card.id,
      name: card.name,
      institutionId:
        card.institutionId ??
        fixtures?.cardInstitutionByResourceId[card.id] ??
        fixtures?.cardInstitutionByResourceId[card.name],
      ownerOperatorId: card.ownerOperatorId ?? fixtures?.demandOperatorId,
    }
  }
  for (const device of state.pos) {
    pos[device.id] = {
      id: device.id,
      name: device.name,
      institutionId: device.institutionId ?? fixtures?.posInstitutionByResourceId[device.id],
      ownerOperatorId: device.ownerOperatorId ?? fixtures?.supplyOperatorId,
    }
  }
  for (const [resourceId, institutionId] of Object.entries(fixtures?.cardInstitutionByResourceId ?? {})) {
    if (!cards[resourceId]) {
      cards[resourceId] = {
        id: resourceId,
        name: resourceId,
        institutionId,
        ownerOperatorId: fixtures?.demandOperatorId,
      }
    }
  }
  for (const [resourceId, institutionId] of Object.entries(fixtures?.posInstitutionByResourceId ?? {})) {
    if (!pos[resourceId]) {
      pos[resourceId] = {
        id: resourceId,
        name: resourceId,
        institutionId,
        ownerOperatorId: fixtures?.supplyOperatorId,
      }
    }
  }
  return {
    demandOperatorId: fixtures?.demandOperatorId ?? '',
    supplyOperatorId: fixtures?.supplyOperatorId ?? '',
    cards,
    pos,
    simulation: true,
  }
}
