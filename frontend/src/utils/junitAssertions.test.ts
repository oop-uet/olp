import { describe, expect, it } from 'vitest'
import { extractJUnitAssertionSummaries } from './junitAssertions'

describe('extractJUnitAssertionSummaries', () => {
  it('extracts common JUnit assertions into readable labels', () => {
    const source = `
      import org.junit.Assert;
      import org.junit.Test;

      public class CoffeeMachineTest {
        @Test
        public void brewCoffeeUsesWater() {
          CoffeeMachine machine = new CoffeeMachine(new WaterTank(1000));
          Assert.assertEquals("water after one cup", 850, machine.getTank().getAmount());
          assertTrue(machine.brew("LATTE"));
          assertFalse(machine.brew("UNKNOWN"));
          assertNotNull(machine.getTank());
        }
      }
    `

    const result = extractJUnitAssertionSummaries(source)

    expect(result.map((item) => item.label)).toEqual([
      'machine.getTank().getAmount() phải bằng 850',
      'Điều kiện đúng: machine.brew("LATTE")',
      'Điều kiện sai: machine.brew("UNKNOWN")',
      'Giá trị không được null: machine.getTank()',
    ])
  })

  it('keeps commas inside strings and nested calls intact', () => {
    const source = `
      public class ParserTest {
        @Test
        public void parsesName() {
          assertEquals("Nguyen, An", PersonParser.parse("Nguyen, An").getName());
          assertArrayEquals(new int[] { 1, 2, 3 }, report.values());
        }
      }
    `

    const result = extractJUnitAssertionSummaries(source)

    expect(result[0].label).toBe('PersonParser.parse("Nguyen, An").getName() phải bằng "Nguyen, An"')
    expect(result[1].label).toBe('report.values() phải có cùng phần tử với new int[] { 1, 2, 3 }')
  })

  it('extracts assertThrows with executable code', () => {
    const source = `
      public class AccountTest {
        @Test
        public void rejectsNegativeDeposit() {
          assertThrows(IllegalArgumentException.class, () -> account.deposit(-1));
        }
      }
    `

    const result = extractJUnitAssertionSummaries(source)

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('() -> account.deposit(-1) phải ném IllegalArgumentException.class')
  })

  it('limits the number of displayed assertions', () => {
    const source = Array.from({ length: 12 }, (_, index) => `assertEquals(${index}, value${index});`).join('\n')

    expect(extractJUnitAssertionSummaries(source, 5)).toHaveLength(5)
  })
})
