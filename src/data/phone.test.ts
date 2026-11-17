import { describe, expect, it } from 'vitest'
import { whatsappNumber, whatsappUrl } from './phone'

describe('whatsappNumber', () => {
  it.each([
    ['0151 23456789', '4915123456789'],
    ['0151-234 567 89', '4915123456789'],
    ['(0151) 23456789', '4915123456789'],
    ['0151/23456789', '4915123456789'],
    ['+49 151 23456789', '4915123456789'],
    ['+49 (0)151 23456789', '4915123456789'],
    ['0049 151 23456789', '4915123456789'],
    ['+27 82 123 4567', '27821234567'],
    ['  +31 6 12345678 ', '31612345678'],
  ])('reads %s', (input, expected) => {
    expect(whatsappNumber(input)).toBe(expected)
  })

  it.each([
    [''],
    [undefined],
    ['15123456789'], // no country code and no leading 0: can't tell which country
    ['0151 2345 6789 ext 2'],
    ['+49 151 +2345'],
    ['0123'],
    ['+49 1512345678901234'],
    ['ask Anna'],
  ])('refuses %s', (input) => {
    expect(whatsappNumber(input)).toBeNull()
  })
})

describe('whatsappUrl', () => {
  it('carries the message, encoded', () => {
    expect(whatsappUrl('4915123456789', 'Hi Anna! Fill in: https://x.io/#/fit/a/b?c=1&d')).toBe(
      'https://wa.me/4915123456789?text=Hi%20Anna!%20Fill%20in%3A%20https%3A%2F%2Fx.io%2F%23%2Ffit%2Fa%2Fb%3Fc%3D1%26d',
    )
  })
})
