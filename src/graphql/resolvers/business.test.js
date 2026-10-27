import { BusinessLand } from './business.js'

describe('BusinessLand.summary', () => {
  test('sums the parcel areas', () => {
    const summary = BusinessLand.summary({
      land: { parcels: [{ area: 1.5 }, { area: 2.25 }] }
    })

    expect(summary).toMatchObject({ totalParcels: 2, totalArea: 3.75 })
  })

  test('reports an unknown area as null, not zero, when any parcel has none', () => {
    const summary = BusinessLand.summary({
      land: { parcels: [{ area: 1.5 }, {}] }
    })

    expect(summary).toMatchObject({ totalParcels: 2, totalArea: null })
  })

  test('is zero for a business without parcels', () => {
    expect(BusinessLand.summary({ land: {} })).toMatchObject({
      totalParcels: 0,
      totalArea: 0
    })
  })

  test('fixture summary values override the computed ones', () => {
    const summary = BusinessLand.summary({
      land: { parcels: [{}], summary: { totalArea: 9.5, arableLandArea: 4 } }
    })

    expect(summary).toMatchObject({ totalArea: 9.5, arableLandArea: 4 })
  })
})
