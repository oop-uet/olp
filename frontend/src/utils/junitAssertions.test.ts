import { describe, expect, it } from 'vitest'
import {
  extractJUnitAssertionSummaries,
  getJavaJUnitTestFileName,
  isJavaJUnitTestInput,
} from './junitAssertions'

describe('extractJUnitAssertionSummaries', () => {
  it('detects OASIS JUnit test metadata', () => {
    expect(isJavaJUnitTestInput('__OOP_JAVA_TEST__\nCoffeeMachineTest.java')).toBe(true)
    expect(isJavaJUnitTestInput('1 2 3')).toBe(false)
    expect(getJavaJUnitTestFileName('__OOP_JAVA_TEST__\nCoffeeMachineTest.java')).toBe('CoffeeMachineTest.java')
    expect(getJavaJUnitTestFileName('__OOP_JAVA_TEST__')).toBe('MyTest.java')
  })

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
      'machine.brew("LATTE") phải trả về true',
      'machine.brew("UNKNOWN") phải trả về false',
      'machine.getTank() không được null',
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
    expect(result[0].label).toBe('() -> account.deposit(-1) phải ném IllegalArgumentException')
  })

  it('describes Java reflection modifier assertions without exposing the full expression', () => {
    const source = `
      public class WaterTankTest {
        @Test
        public void fieldsArePrivate() throws Exception {
          assertTrue(Modifier.isPrivate(WaterTank.class.getDeclaredField("capacity").getModifiers()));
          assertTrue(Modifier.isPrivate(WaterTank.class.getDeclaredField("amount").getModifiers()));
          assertFalse(Modifier.isStatic(WaterTank.class.getDeclaredField("amount").getModifiers()));
        }
      }
    `

    const result = extractJUnitAssertionSummaries(source)

    expect(result.map((item) => item.label)).toEqual([
      'Thuộc tính capacity của lớp WaterTank phải là private',
      'Thuộc tính amount của lớp WaterTank phải là private',
      'Thuộc tính amount của lớp WaterTank không được là static',
    ])
  })

  it('limits the number of displayed assertions', () => {
    const source = Array.from({ length: 12 }, (_, index) => `assertEquals(${index}, value${index});`).join('\n')

    expect(extractJUnitAssertionSummaries(source, 5)).toHaveLength(5)
  })
})
