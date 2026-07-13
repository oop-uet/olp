import "dotenv/config";
import crypto from "node:crypto";
import { db } from "./index.js";
import {
  classSections,
  exerciseAssignments,
  exercises,
  testCases,
} from "./schema.js";
import { ensureDatabaseCompatibility } from "./compat.js";

interface ExerciseSeed {
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  oopTags: string[];
  starterCode: string;
  testCasesData: Array<{
    inputData: string;
    expectedOutput: string;
    isVisible: number;
    pointValue: number;
    timeLimitSeconds?: number;
  }>;
}

function javaStarterFiles(files: Array<{ name: string; content: string }>): string {
  return JSON.stringify(
    {
      format: "oop-java-files",
      version: 1,
      files,
    },
    null,
    2
  );
}

function javaTestCase(fileName: string, source: string, pointValue: number, isVisible = 0) {
  return {
    inputData: `__OOP_JAVA_TEST__\n${fileName}`,
    expectedOutput: source.trim(),
    isVisible,
    pointValue,
    timeLimitSeconds: 10,
  };
}

function stdoutCase(inputData: string, expectedOutput: string, pointValue: number, isVisible = 1) {
  return {
    inputData,
    expectedOutput,
    isVisible,
    pointValue,
    timeLimitSeconds: 5,
  };
}

function stableId(title: string) {
  return `exercise-${crypto.createHash("sha1").update(title).digest("hex").slice(0, 24)}`;
}

function weekFromTitle(title: string): number | null {
  const match = title.match(/Tuần\s+(\d+)/i);
  if (!match) return null;
  const week = Number.parseInt(match[1], 10);
  return Number.isInteger(week) && week >= 1 ? week : null;
}

function isDefaultAssessment(title: string): number {
  return title.includes("Quản lý thư viện mini") || title.includes("Số tiền chính xác") ? 1 : 0;
}

function isDefaultVisible(title: string): number {
  return title.includes("Bài tập lớn") ? 1 : 0;
}

const exerciseSeeds: ExerciseSeed[] = [
  {
    title: "Tuần 1 - Hello World và tham số dòng lệnh",
    description: [
      "# Tuần 1. Cài đặt môi trường Java",
      "",
      "## Yêu cầu",
      "- Tạo lớp `Main`.",
      "- Khi chạy không có input, chương trình in đúng `Hello World`.",
      "- Nếu stdin có một dòng tên sinh viên, chương trình in thêm dòng `Hello <tên>`.",
      "- Không in prompt hoặc nội dung thừa.",
      "",
      "Bài này giúp kiểm tra JDK, quá trình biên dịch, chạy chương trình Java và thao tác nhập/xuất chuẩn.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["java-basics", "io"],
    starterCode: javaStarterFiles([
      {
        name: "Main.java",
        content: [
          "import java.util.Scanner;",
          "",
          "public class Main {",
          "    public static void main(String[] args) {",
          "        // TODO: In Hello World.",
          "        // Nếu có tên ở stdin, in thêm Hello <ten>.",
          "    }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      stdoutCase("", "Hello World", 25),
      stdoutCase("An", "Hello World\nHello An", 25, 0),
      stdoutCase("Pham Van Minh", "Hello World\nHello Pham Van Minh", 25, 0),
      stdoutCase("  Nguyen Thi An  ", "Hello World\nHello Nguyen Thi An", 25, 0),
    ],
  },
  {
    title: "Tuần 1 - Máy pha cà phê và bình nước",
    description: [
      "# Tuần 1. Đối tượng, trạng thái và quan hệ has-a",
      "",
      "Cài đặt hai lớp `WaterTank` và `CoffeeMachine`.",
      "",
      "## `WaterTank`",
      "- Có thuộc tính `private int capacity` và `private int amount`.",
      "- Constructor `WaterTank(int capacity)` đặt dung tích tối đa. Nếu capacity âm thì dùng `0`.",
      "- `void addWater(int ml)` thêm nước, không vượt quá `capacity`, bỏ qua lượng âm.",
      "- `boolean useWater(int ml)` trừ nước nếu đủ và trả về `true`; nếu không đủ thì giữ nguyên và trả về `false`.",
      "- Getter `getCapacity()` và `getAmount()`.",
      "",
      "## `CoffeeMachine`",
      "- Có thuộc tính `private String model`, `private WaterTank tank`, `private int cupsMade`.",
      "- Constructor `CoffeeMachine(String model, WaterTank tank)`.",
      "- `String brew(String drink)` cần 200 ml nước. Nếu đủ nước, tăng `cupsMade` và trả về `Brewing <drink> on <model>`.",
      "- Nếu không đủ nước, trả về `Not enough water`.",
      "- `int getCupsMade()` trả về số ly đã pha.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["oop-concepts", "composition", "encapsulation"],
    starterCode: javaStarterFiles([
      {
        name: "WaterTank.java",
        content: [
          "public class WaterTank {",
          "    private int capacity;",
          "    private int amount;",
          "",
          "    public WaterTank(int capacity) {",
          "        // TODO",
          "    }",
          "",
          "    public void addWater(int ml) {",
          "        // TODO",
          "    }",
          "",
          "    public boolean useWater(int ml) {",
          "        // TODO",
          "        return false;",
          "    }",
          "",
          "    public int getCapacity() { return capacity; }",
          "    public int getAmount() { return amount; }",
          "}",
        ].join("\n"),
      },
      {
        name: "CoffeeMachine.java",
        content: [
          "public class CoffeeMachine {",
          "    private String model;",
          "    private WaterTank tank;",
          "    private int cupsMade;",
          "",
          "    public CoffeeMachine(String model, WaterTank tank) {",
          "        // TODO",
          "    }",
          "",
          "    public String brew(String drink) {",
          "        // TODO",
          "        return \"\";",
          "    }",
          "",
          "    public int getCupsMade() { return cupsMade; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "CoffeeMachineTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.lang.reflect.Modifier;

public class CoffeeMachineTest {
    @Test
    public void waterTankClampsAndConsumesWater() throws Exception {
        Assert.assertTrue(Modifier.isPrivate(WaterTank.class.getDeclaredField("capacity").getModifiers()));
        Assert.assertTrue(Modifier.isPrivate(WaterTank.class.getDeclaredField("amount").getModifiers()));
        WaterTank tank = new WaterTank(500);
        tank.addWater(700);
        Assert.assertEquals(500, tank.getAmount());
        Assert.assertTrue(tank.useWater(200));
        Assert.assertEquals(300, tank.getAmount());
        Assert.assertFalse(tank.useWater(400));
        Assert.assertEquals(300, tank.getAmount());
    }

    @Test
    public void coffeeMachineUsesItsTank() {
        WaterTank tank = new WaterTank(450);
        tank.addWater(450);
        CoffeeMachine machine = new CoffeeMachine("Aroma-7", tank);
        Assert.assertEquals("Brewing espresso on Aroma-7", machine.brew("espresso"));
        Assert.assertEquals("Brewing latte on Aroma-7", machine.brew("latte"));
        Assert.assertEquals("Not enough water", machine.brew("americano"));
        Assert.assertEquals(2, machine.getCupsMade());
        Assert.assertEquals(50, tank.getAmount());
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 2 - Quản lý thư viện mini",
    description: [
      "# Tuần 2. Getter/setter, constructor và mảng đối tượng",
      "",
      "Cài đặt lớp `LibraryMember`:",
      "- Có các thuộc tính `private String fullName`, `private String cardId`, `private String email`, `private boolean active`.",
      "- Constructor mặc định tạo hồ sơ `Guest - CARD-000 - guest@library.local - active`.",
      "- Constructor `LibraryMember(String fullName, String cardId, String email)` đặt `active = true`.",
      "- Constructor sao chép `LibraryMember(LibraryMember other)`.",
      "- Getter/setter đầy đủ cho 4 thuộc tính.",
      "- `String getProfile()` trả về `<cardId> - <fullName> - <email> - <active|inactive>`.",
      "",
      "Cài đặt lớp `LibraryRegistry`:",
      "- Có mảng `members` kiểu `LibraryMember[]`, tối đa 100 phần tử.",
      "- `void addMember(LibraryMember member)` thêm thẻ nếu `cardId` chưa tồn tại.",
      "- `void deactivateMember(String cardId)` chuyển thành viên sang trạng thái inactive.",
      "- `int countActive()` đếm thành viên đang active.",
      "- `String findByEmailDomain(String domain)` trả về mỗi profile khớp domain trên một dòng, theo thứ tự thêm.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["classes", "objects", "encapsulation", "constructor"],
    starterCode: javaStarterFiles([
      {
        name: "LibraryMember.java",
        content: [
          "public class LibraryMember {",
          "    private String fullName;",
          "    private String cardId;",
          "    private String email;",
          "    private boolean active;",
          "",
          "    public LibraryMember() {",
          "        // TODO",
          "    }",
          "",
          "    public LibraryMember(String fullName, String cardId, String email) {",
          "        // TODO",
          "    }",
          "",
          "    public LibraryMember(LibraryMember other) {",
          "        // TODO",
          "    }",
          "",
          "    public String getFullName() { return fullName; }",
          "    public void setFullName(String fullName) { this.fullName = fullName; }",
          "    public String getCardId() { return cardId; }",
          "    public void setCardId(String cardId) { this.cardId = cardId; }",
          "    public String getEmail() { return email; }",
          "    public void setEmail(String email) { this.email = email; }",
          "    public boolean isActive() { return active; }",
          "    public void setActive(boolean active) { this.active = active; }",
          "",
          "    public String getProfile() {",
          "        // TODO",
          "        return \"\";",
          "    }",
          "}",
        ].join("\n"),
      },
      {
        name: "LibraryRegistry.java",
        content: [
          "public class LibraryRegistry {",
          "    private LibraryMember[] members = new LibraryMember[100];",
          "    private int memberCount = 0;",
          "",
          "    public void addMember(LibraryMember member) {",
          "        // TODO",
          "    }",
          "",
          "    public void deactivateMember(String cardId) {",
          "        // TODO",
          "    }",
          "",
          "    public int countActive() {",
          "        // TODO",
          "        return 0;",
          "    }",
          "",
          "    public String findByEmailDomain(String domain) {",
          "        // TODO",
          "        return \"\";",
          "    }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "LibraryTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.lang.reflect.Modifier;

public class LibraryTest {
    @Test
    public void memberConstructorsAndProfileWork() throws Exception {
        Assert.assertTrue(Modifier.isPrivate(LibraryMember.class.getDeclaredField("fullName").getModifiers()));
        LibraryMember guest = new LibraryMember();
        Assert.assertEquals("CARD-000 - Guest - guest@library.local - active", guest.getProfile());
        LibraryMember an = new LibraryMember("Nguyen An", "LIB-001", "an@vnu.edu.vn");
        an.setActive(false);
        LibraryMember copy = new LibraryMember(an);
        an.setFullName("Changed");
        Assert.assertEquals("LIB-001 - Nguyen An - an@vnu.edu.vn - inactive", copy.getProfile());
    }

    @Test
    public void registryAddsUniqueCardsAndFiltersDomain() {
        LibraryRegistry registry = new LibraryRegistry();
        registry.addMember(new LibraryMember("An", "LIB-001", "an@vnu.edu.vn"));
        registry.addMember(new LibraryMember("Binh", "LIB-002", "binh@gmail.com"));
        registry.addMember(new LibraryMember("Duplicate", "LIB-001", "dup@vnu.edu.vn"));
        registry.deactivateMember("LIB-002");
        Assert.assertEquals(1, registry.countActive());
        Assert.assertEquals("LIB-001 - An - an@vnu.edu.vn - active", registry.findByEmailDomain("vnu.edu.vn").trim());
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 3 - SensorMath và dãy số",
    description: [
      "# Tuần 3. Kiểu nguyên thủy và phương thức tĩnh",
      "",
      "Cài đặt lớp `SensorMath` với các phương thức `public static`:",
      "- `int digitalRoot(int n)`: tính tổng chữ số lặp lại đến khi còn một chữ số. Dùng trị tuyệt đối của `n`.",
      "- `boolean isArmstrong(int n)`: kiểm tra số Armstrong trong hệ thập phân. Số âm trả về `false`.",
      "- `String compressRanges(int[] values)`: với mảng số nguyên đã tăng dần, nén các đoạn liên tiếp. Ví dụ `[1,2,3,5,7,8]` thành `1-3,5,7-8`.",
      "",
      "Không dùng thư viện ngoài. Cần xử lý mảng rỗng, số âm và các đoạn chỉ có một phần tử.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["primitive-types", "static-methods", "arrays"],
    starterCode: javaStarterFiles([
      {
        name: "SensorMath.java",
        content: [
          "public class SensorMath {",
          "    public static int digitalRoot(int n) {",
          "        // TODO",
          "        return 0;",
          "    }",
          "",
          "    public static boolean isArmstrong(int n) {",
          "        // TODO",
          "        return false;",
          "    }",
          "",
          "    public static String compressRanges(int[] values) {",
          "        // TODO",
          "        return \"\";",
          "    }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "SensorMathTest.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class SensorMathTest {
    @Test
    public void digitalRootHandlesSignsAndZero() {
        Assert.assertEquals(0, SensorMath.digitalRoot(0));
        Assert.assertEquals(9, SensorMath.digitalRoot(987654));
        Assert.assertEquals(6, SensorMath.digitalRoot(-123));
    }

    @Test
    public void armstrongDetectionWorks() {
        Assert.assertTrue(SensorMath.isArmstrong(153));
        Assert.assertTrue(SensorMath.isArmstrong(9474));
        Assert.assertFalse(SensorMath.isArmstrong(9475));
        Assert.assertFalse(SensorMath.isArmstrong(-153));
    }

    @Test
    public void rangesAreCompressed() {
        Assert.assertEquals("", SensorMath.compressRanges(new int[] {}));
        Assert.assertEquals("1-3,5,7-9", SensorMath.compressRanges(new int[] {1, 2, 3, 5, 7, 8, 9}));
        Assert.assertEquals("-3--1,2", SensorMath.compressRanges(new int[] {-3, -2, -1, 2}));
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 3 - Số tiền chính xác",
    description: [
      "# Tuần 3. Value object, equals và bất biến dữ liệu",
      "",
      "Cài đặt lớp `MoneyAmount`:",
      "- Có thuộc tính `private long cents` lưu tổng số cent.",
      "- Constructor `MoneyAmount(long cents)`.",
      "- Constructor `MoneyAmount(long units, int cents)`; `cents` phải trong khoảng `0..99`, nếu không ném `IllegalArgumentException` với thông điệp `Invalid cents`.",
      "- `long getCents()`.",
      "- `MoneyAmount add(MoneyAmount other)`, `subtract(MoneyAmount other)`, `multiply(int factor)` trả về đối tượng mới.",
      "- `boolean isNegative()`.",
      "- Override `equals(Object obj)` để so sánh theo tổng cent.",
      "- `toString()` trả về dạng tiền có 2 chữ số phần lẻ, ví dụ `12.05`, `-3.40`.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["classes", "encapsulation", "equals", "immutability"],
    starterCode: javaStarterFiles([
      {
        name: "MoneyAmount.java",
        content: [
          "public class MoneyAmount {",
          "    private long cents;",
          "",
          "    public MoneyAmount(long cents) {",
          "        // TODO",
          "    }",
          "",
          "    public MoneyAmount(long units, int cents) {",
          "        // TODO",
          "    }",
          "",
          "    public long getCents() { return cents; }",
          "    public MoneyAmount add(MoneyAmount other) { return null; }",
          "    public MoneyAmount subtract(MoneyAmount other) { return null; }",
          "    public MoneyAmount multiply(int factor) { return null; }",
          "    public boolean isNegative() { return false; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "MoneyAmountTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.lang.reflect.Modifier;

public class MoneyAmountTest {
    @Test
    public void fieldsAndFormattingWork() throws Exception {
        Assert.assertTrue(Modifier.isPrivate(MoneyAmount.class.getDeclaredField("cents").getModifiers()));
        Assert.assertEquals("12.05", new MoneyAmount(12, 5).toString());
        Assert.assertEquals("-3.40", new MoneyAmount(-340).toString());
        Assert.assertEquals("0.00", new MoneyAmount(0).toString());
    }

    @Test
    public void arithmeticReturnsNewValues() {
        MoneyAmount a = new MoneyAmount(10, 50);
        MoneyAmount b = new MoneyAmount(275);
        Assert.assertEquals("13.25", a.add(b).toString());
        Assert.assertEquals("7.75", a.subtract(b).toString());
        Assert.assertEquals("21.00", a.multiply(2).toString());
        Assert.assertEquals("10.50", a.toString());
    }

    @Test
    public void equalityAndValidationWork() {
        Assert.assertEquals(new MoneyAmount(1050), new MoneyAmount(10, 50));
        Assert.assertTrue(new MoneyAmount(-1).isNegative());
        try {
            new MoneyAmount(1, 120);
            Assert.fail("Expected IllegalArgumentException");
        } catch (IllegalArgumentException ex) {
            Assert.assertEquals("Invalid cents", ex.getMessage());
        }
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 4 - Bảng điểm học phần",
    description: [
      "# Tuần 4. Static, mảng và kiểm thử",
      "",
      "Cài đặt lớp `CourseScores` với các phương thức `public static`:",
      "- `double average(int[] scores)`: trả về điểm trung bình, làm tròn 2 chữ số thập phân.",
      "- `int countAtLeast(int[] scores, int threshold)`: đếm số điểm lớn hơn hoặc bằng ngưỡng.",
      "- `String grade(double average)`: quy đổi `A` nếu >= 8.5, `B` nếu >= 7.0, `C` nếu >= 5.5, `D` nếu >= 4.0, còn lại `F`.",
      "- `int[] normalizeBonus(int[] scores, int bonus)`: trả về mảng mới sau khi cộng bonus, mỗi điểm tối đa 10; không thay đổi mảng đầu vào.",
      "",
      "Nếu mảng điểm `null` hoặc rỗng, `average` và `countAtLeast` ném `IllegalArgumentException`.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["static-methods", "arrays", "junit"],
    starterCode: javaStarterFiles([
      {
        name: "CourseScores.java",
        content: [
          "public class CourseScores {",
          "    public static double average(int[] scores) { return 0; }",
          "    public static int countAtLeast(int[] scores, int threshold) { return 0; }",
          "    public static String grade(double average) { return \"\"; }",
          "    public static int[] normalizeBonus(int[] scores, int bonus) { return new int[0]; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "CourseScoresTest.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class CourseScoresTest {
    @Test
    public void averageCountAndGradeWork() {
        int[] scores = {8, 9, 6, 10};
        Assert.assertEquals(8.25, CourseScores.average(scores), 0.0001);
        Assert.assertEquals(3, CourseScores.countAtLeast(scores, 8));
        Assert.assertEquals("B", CourseScores.grade(8.25));
        Assert.assertEquals("F", CourseScores.grade(3.9));
    }

    @Test
    public void bonusDoesNotMutateInput() {
        int[] scores = {7, 9, 10};
        Assert.assertArrayEquals(new int[] {9, 10, 10}, CourseScores.normalizeBonus(scores, 2));
        Assert.assertArrayEquals(new int[] {7, 9, 10}, scores);
    }

    @Test(expected = IllegalArgumentException.class)
    public void emptyAverageThrowsException() {
        CourseScores.average(new int[] {});
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 4 - Phương tiện điện",
    description: [
      "# Tuần 4. Kế thừa, constructor và overriding",
      "",
      "Cài đặt hai lớp:",
      "",
      "## `Vehicle`",
      "- Thuộc tính `protected String licensePlate`, `protected int speed`.",
      "- Constructor `Vehicle(String licensePlate)` đặt speed ban đầu là `0`.",
      "- `void accelerate(int amount)` tăng tốc nếu amount dương.",
      "- `void brake(int amount)` giảm tốc nhưng không thấp hơn 0.",
      "- `String move()` trả về `Vehicle <licensePlate> moves at <speed> km/h`.",
      "",
      "## `ElectricCar extends Vehicle`",
      "- Thuộc tính `private int batteryLevel` trong khoảng `0..100`.",
      "- Constructor `ElectricCar(String licensePlate, int batteryLevel)`.",
      "- `void charge(int amount)` tăng pin, tối đa 100.",
      "- `boolean consumeBattery(int amount)` trừ pin nếu đủ.",
      "- Override `move()` trả về `ElectricCar <licensePlate> moves at <speed> km/h with <batteryLevel>% battery`.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["inheritance", "constructor", "overriding"],
    starterCode: javaStarterFiles([
      {
        name: "Vehicle.java",
        content: [
          "public class Vehicle {",
          "    protected String licensePlate;",
          "    protected int speed;",
          "",
          "    public Vehicle(String licensePlate) {",
          "        // TODO",
          "    }",
          "",
          "    public void accelerate(int amount) { }",
          "    public void brake(int amount) { }",
          "    public String move() { return \"\"; }",
          "    public int getSpeed() { return speed; }",
          "}",
        ].join("\n"),
      },
      {
        name: "ElectricCar.java",
        content: [
          "public class ElectricCar extends Vehicle {",
          "    private int batteryLevel;",
          "",
          "    public ElectricCar(String licensePlate, int batteryLevel) {",
          "        super(licensePlate);",
          "        // TODO",
          "    }",
          "",
          "    public void charge(int amount) { }",
          "    public boolean consumeBattery(int amount) { return false; }",
          "    public int getBatteryLevel() { return batteryLevel; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "VehicleTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.lang.reflect.Modifier;

public class VehicleTest {
    @Test
    public void vehicleSpeedNeverBecomesNegative() throws Exception {
        Assert.assertTrue(Modifier.isProtected(Vehicle.class.getDeclaredField("licensePlate").getModifiers()));
        Vehicle vehicle = new Vehicle("30A-12345");
        vehicle.accelerate(40);
        vehicle.brake(15);
        Assert.assertEquals("Vehicle 30A-12345 moves at 25 km/h", vehicle.move());
        vehicle.brake(100);
        Assert.assertEquals(0, vehicle.getSpeed());
    }

    @Test
    public void electricCarOverridesMoveAndManagesBattery() {
        ElectricCar car = new ElectricCar("EV-01", 80);
        Assert.assertEquals(Vehicle.class, ElectricCar.class.getSuperclass());
        car.accelerate(60);
        Assert.assertTrue(car.consumeBattery(30));
        Assert.assertFalse(car.consumeBattery(60));
        car.charge(15);
        Assert.assertEquals(65, car.getBatteryLevel());
        Assert.assertEquals("ElectricCar EV-01 moves at 60 km/h with 65% battery", car.move());
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 5 - Playlist đa phương tiện",
    description: [
      "# Tuần 5. Abstract class, đa hình và collection",
      "",
      "Cài đặt mô hình playlist:",
      "- `abstract class MediaItem` có `title`, `durationSeconds`, constructor, getter và `abstract String play()`.",
      "- `Song extends MediaItem` có thêm `artist`, `play()` trả về `Song: <title> by <artist>`.",
      "- `PodcastEpisode extends MediaItem` có thêm `showName`, `play()` trả về `Podcast: <showName> - <title>`.",
      "- `VideoClip extends MediaItem` có thêm `resolution`, `play()` trả về `Video: <title> [<resolution>]`.",
      "- `Playlist` quản lý danh sách `MediaItem`, có `addItem`, `int totalDuration()`, `String playAll()`.",
      "",
      "`playAll()` trả về kết quả `play()` của từng item, mỗi item một dòng và giữ thứ tự thêm.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["polymorphism", "abstraction", "collections"],
    starterCode: javaStarterFiles([
      {
        name: "Playlist.java",
        content: [
          "import java.util.*;",
          "",
          "abstract class MediaItem {",
          "    protected String title;",
          "    protected int durationSeconds;",
          "    public MediaItem(String title, int durationSeconds) {",
          "        // TODO",
          "    }",
          "    public String getTitle() { return title; }",
          "    public int getDurationSeconds() { return durationSeconds; }",
          "    public abstract String play();",
          "}",
          "",
          "class Song extends MediaItem {",
          "    // TODO",
          "    public Song(String title, int durationSeconds, String artist) { super(title, durationSeconds); }",
          "    public String play() { return \"\"; }",
          "}",
          "",
          "class PodcastEpisode extends MediaItem {",
          "    public PodcastEpisode(String title, int durationSeconds, String showName) { super(title, durationSeconds); }",
          "    public String play() { return \"\"; }",
          "}",
          "",
          "class VideoClip extends MediaItem {",
          "    public VideoClip(String title, int durationSeconds, String resolution) { super(title, durationSeconds); }",
          "    public String play() { return \"\"; }",
          "}",
          "",
          "public class Playlist {",
          "    private List<MediaItem> items = new ArrayList<>();",
          "    public void addItem(MediaItem item) { }",
          "    public int totalDuration() { return 0; }",
          "    public String playAll() { return \"\"; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "PlaylistTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.lang.reflect.Modifier;

public class PlaylistTest {
    @Test
    public void mediaItemIsAbstractAndSubclassesPlayDifferently() {
        Assert.assertTrue(Modifier.isAbstract(MediaItem.class.getModifiers()));
        Assert.assertEquals("Song: Morning by Linh", new Song("Morning", 180, "Linh").play());
        Assert.assertEquals("Podcast: OOP Talks - Interfaces", new PodcastEpisode("Interfaces", 900, "OOP Talks").play());
        Assert.assertEquals("Video: Demo [1080p]", new VideoClip("Demo", 120, "1080p").play());
    }

    @Test
    public void playlistUsesPolymorphism() {
        Playlist playlist = new Playlist();
        playlist.addItem(new Song("Morning", 180, "Linh"));
        playlist.addItem(new PodcastEpisode("Interfaces", 900, "OOP Talks"));
        playlist.addItem(new VideoClip("Demo", 120, "1080p"));
        Assert.assertEquals(1200, playlist.totalDuration());
        Assert.assertEquals(
            "Song: Morning by Linh\\nPodcast: OOP Talks - Interfaces\\nVideo: Demo [1080p]",
            playlist.playAll().trim()
        );
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 5 - Phòng học thông minh",
    description: [
      "# Tuần 5. Interface, đa hình và quản lý danh sách",
      "",
      "Cài đặt:",
      "- `interface Switchable` có `turnOn()`, `turnOff()`, `boolean isOn()`.",
      "- `abstract class SmartDevice implements Switchable` có `id`, `room`, trạng thái bật/tắt và `String status()`.",
      "- `LightDevice` có thêm `brightness`, status dạng `Light <id> in <room>: on/off (<brightness>%)`.",
      "- `AirConditioner` có thêm `temperature`, status dạng `AC <id> in <room>: on/off (<temperature>C)`.",
      "- `SmartRoom` chứa danh sách `SmartDevice`, có `addDevice`, `turnAllOn`, `turnAllOff`, `countOn`, `String report()`.",
      "",
      "`report()` liệt kê status của thiết bị theo thứ tự thêm, mỗi dòng một thiết bị.",
    ].join("\n"),
    difficulty: "hard",
    oopTags: ["polymorphism", "interfaces", "collections"],
    starterCode: javaStarterFiles([
      {
        name: "SmartRoom.java",
        content: [
          "import java.util.*;",
          "",
          "interface Switchable {",
          "    void turnOn();",
          "    void turnOff();",
          "    boolean isOn();",
          "}",
          "",
          "abstract class SmartDevice implements Switchable {",
          "    protected String id;",
          "    protected String room;",
          "    protected boolean on;",
          "    public SmartDevice(String id, String room) { }",
          "    public void turnOn() { }",
          "    public void turnOff() { }",
          "    public boolean isOn() { return false; }",
          "    public abstract String status();",
          "}",
          "",
          "class LightDevice extends SmartDevice {",
          "    public LightDevice(String id, String room, int brightness) { super(id, room); }",
          "    public String status() { return \"\"; }",
          "}",
          "",
          "class AirConditioner extends SmartDevice {",
          "    public AirConditioner(String id, String room, int temperature) { super(id, room); }",
          "    public String status() { return \"\"; }",
          "}",
          "",
          "public class SmartRoom {",
          "    private List<SmartDevice> devices = new ArrayList<>();",
          "    public void addDevice(SmartDevice device) { }",
          "    public void turnAllOn() { }",
          "    public void turnAllOff() { }",
          "    public int countOn() { return 0; }",
          "    public String report() { return \"\"; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "SmartRoomTest.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class SmartRoomTest {
    @Test
    public void devicesImplementSwitchable() {
        LightDevice light = new LightDevice("L1", "Lab", 75);
        Assert.assertTrue(light instanceof Switchable);
        Assert.assertFalse(light.isOn());
        light.turnOn();
        Assert.assertEquals("Light L1 in Lab: on (75%)", light.status());
    }

    @Test
    public void roomControlsAllDevices() {
        SmartRoom room = new SmartRoom();
        room.addDevice(new LightDevice("L1", "Lab", 75));
        room.addDevice(new AirConditioner("A1", "Lab", 24));
        room.turnAllOn();
        Assert.assertEquals(2, room.countOn());
        Assert.assertEquals("Light L1 in Lab: on (75%)\\nAC A1 in Lab: on (24C)", room.report().trim());
        room.turnAllOff();
        Assert.assertEquals(0, room.countOn());
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 6 - Đăng ký tài khoản an toàn",
    description: [
      "# Tuần 6. Exception và custom exception",
      "",
      "Cài đặt:",
      "- `InvalidRegistrationException extends Exception`.",
      "- `RegistrationForm.parseAge(String text)` trả về tuổi dạng số nguyên; nếu không parse được hoặc tuổi ngoài `13..120`, ném `InvalidRegistrationException`.",
      "- `RegistrationForm.validateEmail(String email)` trả về `true` nếu email chứa đúng một ký tự `@` và có dấu `.` sau `@`; ngược lại ném `InvalidRegistrationException`.",
      "- `RegistrationForm.register(String email, String ageText)` trả về `Registered <email> (<age>)` nếu hợp lệ.",
      "- Nếu dữ liệu không hợp lệ, `register` bắt exception và trả về `Invalid registration: <message>`.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["exception-handling", "custom-exception"],
    starterCode: javaStarterFiles([
      {
        name: "RegistrationForm.java",
        content: [
          "class InvalidRegistrationException extends Exception {",
          "    public InvalidRegistrationException(String message) {",
          "        super(message);",
          "    }",
          "}",
          "",
          "public class RegistrationForm {",
          "    public static int parseAge(String text) throws InvalidRegistrationException {",
          "        return 0;",
          "    }",
          "",
          "    public static boolean validateEmail(String email) throws InvalidRegistrationException {",
          "        return false;",
          "    }",
          "",
          "    public static String register(String email, String ageText) {",
          "        return \"\";",
          "    }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "RegistrationFormTest.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class RegistrationFormTest {
    @Test
    public void validRegistrationWorks() {
        Assert.assertEquals(20, RegistrationForm.parseAge("20"));
        Assert.assertTrue(RegistrationForm.validateEmail("student@vnu.edu.vn"));
        Assert.assertEquals("Registered student@vnu.edu.vn (20)", RegistrationForm.register("student@vnu.edu.vn", "20"));
    }

    @Test
    public void invalidDataIsReportedByRegister() {
        Assert.assertEquals("Invalid registration: Age must be between 13 and 120", RegistrationForm.register("a@b.com", "12"));
        Assert.assertEquals("Invalid registration: Invalid email", RegistrationForm.register("not-an-email", "18"));
        Assert.assertEquals("Invalid registration: Age is not a number", RegistrationForm.register("a@b.com", "abc"));
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 7 - Nhật ký học tập",
    description: [
      "# Tuần 7. I/O Streams và File",
      "",
      "Cài đặt lớp `JournalStore` với các phương thức `public static`:",
      "- `void writeEntry(String path, String content)` ghi mới nội dung UTF-8, tạo file nếu chưa có.",
      "- `void appendEntry(String path, String content)` nối nội dung vào cuối file.",
      "- `String readEntry(String path)` đọc toàn bộ nội dung UTF-8.",
      "- `File findEntryFile(String folderPath, String fileName)` tìm file trong thư mục và các thư mục con; không thấy trả về `null`.",
      "",
      "Có thể dùng `java.io` hoặc `java.nio.file`, nhưng cần đóng tài nguyên đúng cách.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["io-streams", "files", "static-methods"],
    starterCode: javaStarterFiles([
      {
        name: "JournalStore.java",
        content: [
          "import java.io.File;",
          "",
          "public class JournalStore {",
          "    public static void writeEntry(String path, String content) { }",
          "    public static void appendEntry(String path, String content) { }",
          "    public static String readEntry(String path) { return \"\"; }",
          "    public static File findEntryFile(String folderPath, String fileName) { return null; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "JournalStoreTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

public class JournalStoreTest {
    @Test
    public void writeAppendReadAndFindWork() throws Exception {
        Path dir = Files.createTempDirectory("journal-store");
        Path file = dir.resolve("week7.txt");
        JournalStore.writeEntry(file.toString(), "Day 1");
        JournalStore.appendEntry(file.toString(), "\\nDay 2");
        Assert.assertEquals("Day 1\\nDay 2", JournalStore.readEntry(file.toString()));

        Path nested = dir.resolve("notes").resolve("oop");
        Files.createDirectories(nested);
        Files.writeString(nested.resolve("target.md"), "content");
        File found = JournalStore.findEntryFile(dir.toString(), "target.md");
        Assert.assertNotNull(found);
        Assert.assertEquals("target.md", found.getName());
        Assert.assertNull(JournalStore.findEntryFile(dir.toString(), "missing.md"));
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 8 - Kho dữ liệu generic",
    description: [
      "# Tuần 8. Generic, interface và Comparable",
      "",
      "Cài đặt:",
      "- `interface Identifiable` có `String getId()`.",
      "- `class Product implements Identifiable, Comparable<Product>` có `id`, `name`, `price`.",
      "- `Product.compareTo` sắp xếp theo `price` tăng dần, nếu bằng nhau thì theo `name` tăng dần.",
      "- `class Repository<T extends Identifiable>` quản lý danh sách phần tử.",
      "- `void save(T item)` thêm mới hoặc thay thế phần tử trùng id.",
      "- `T findById(String id)` trả về phần tử hoặc `null`.",
      "- `List<T> findAll()` trả về danh sách mới theo thứ tự lưu.",
      "- `static <T extends Comparable<T>> List<T> sortedCopy(List<T> input)` trả về bản sao đã sắp xếp, không đổi input.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["generics", "comparable", "collections"],
    starterCode: javaStarterFiles([
      {
        name: "Repository.java",
        content: [
          "import java.util.*;",
          "",
          "interface Identifiable {",
          "    String getId();",
          "}",
          "",
          "class Product implements Identifiable, Comparable<Product> {",
          "    private String id;",
          "    private String name;",
          "    private int price;",
          "    public Product(String id, String name, int price) { }",
          "    public String getId() { return id; }",
          "    public String getName() { return name; }",
          "    public int getPrice() { return price; }",
          "    public int compareTo(Product other) { return 0; }",
          "    public String toString() { return \"\"; }",
          "}",
          "",
          "public class Repository<T extends Identifiable> {",
          "    private List<T> items = new ArrayList<>();",
          "    public void save(T item) { }",
          "    public T findById(String id) { return null; }",
          "    public List<T> findAll() { return new ArrayList<>(); }",
          "    public static <T extends Comparable<T>> List<T> sortedCopy(List<T> input) { return new ArrayList<>(); }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "RepositoryTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.util.*;

public class RepositoryTest {
    @Test
    public void repositorySavesReplacesAndFindsById() {
        Repository<Product> repo = new Repository<>();
        repo.save(new Product("P1", "Book", 120));
        repo.save(new Product("P2", "Pen", 10));
        repo.save(new Product("P1", "Notebook", 80));
        Assert.assertEquals(2, repo.findAll().size());
        Assert.assertEquals("P1-Notebook-80", repo.findById("P1").toString());
        Assert.assertNull(repo.findById("missing"));
    }

    @Test
    public void sortedCopyDoesNotMutateInput() {
        List<Product> products = new ArrayList<>(Arrays.asList(
            new Product("P1", "Book", 120),
            new Product("P2", "Pen", 10),
            new Product("P3", "Album", 120)
        ));
        List<Product> sorted = Repository.sortedCopy(products);
        Assert.assertEquals("P2-Pen-10", sorted.get(0).toString());
        Assert.assertEquals("P3-Album-120", sorted.get(1).toString());
        Assert.assertEquals("P1-Book-120", products.get(0).toString());
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 9 - Phân tích access log",
    description: [
      "# Tuần 9. String, List và Map",
      "",
      "Cài đặt lớp `AccessLogAnalyzer`:",
      "- Mỗi dòng log có dạng `<user> <action>`, ví dụ `alice LOGIN`.",
      "- `List<String> users(String logs)` trả về danh sách user khác nhau theo thứ tự xuất hiện đầu tiên.",
      "- `Map<String, Integer> actionCounts(String logs)` đếm số lần xuất hiện của từng action, giữ thứ tự action xuất hiện.",
      "- `String topUsers(String logs, int limit)` trả về các dòng `user=count`, sắp xếp giảm dần theo số dòng log của user; nếu bằng nhau giữ thứ tự xuất hiện.",
      "",
      "Bỏ qua dòng rỗng và dòng không đủ 2 token.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["strings", "collections", "map"],
    starterCode: javaStarterFiles([
      {
        name: "AccessLogAnalyzer.java",
        content: [
          "import java.util.*;",
          "",
          "public class AccessLogAnalyzer {",
          "    public static List<String> users(String logs) { return new ArrayList<>(); }",
          "    public static Map<String, Integer> actionCounts(String logs) { return new LinkedHashMap<>(); }",
          "    public static String topUsers(String logs, int limit) { return \"\"; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "AccessLogAnalyzerTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.util.*;

public class AccessLogAnalyzerTest {
    private static final String LOGS =
        "alice LOGIN\\n" +
        "bob VIEW\\n" +
        "alice VIEW\\n" +
        "broken\\n" +
        "\\n" +
        "carol LOGIN\\n" +
        "bob LOGOUT\\n";

    @Test
    public void usersKeepFirstAppearanceOrder() {
        Assert.assertEquals(Arrays.asList("alice", "bob", "carol"), AccessLogAnalyzer.users(LOGS));
    }

    @Test
    public void actionsAreCountedInInsertionOrder() {
        Map<String, Integer> counts = AccessLogAnalyzer.actionCounts(LOGS);
        Assert.assertEquals(Arrays.asList("LOGIN", "VIEW", "LOGOUT"), new ArrayList<>(counts.keySet()));
        Assert.assertEquals(Integer.valueOf(2), counts.get("LOGIN"));
        Assert.assertEquals(Integer.valueOf(2), counts.get("VIEW"));
    }

    @Test
    public void topUsersSortsByCountThenAppearance() {
        Assert.assertEquals("alice=2\\nbob=2", AccessLogAnalyzer.topUsers(LOGS, 2));
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 10 - Cây công việc với Composite",
    description: [
      "# Tuần 10. Design Pattern: Composite",
      "",
      "Cài đặt mô hình cây công việc:",
      "- `TaskNode` có `title`, `done`, danh sách công việc con.",
      "- `void addChild(TaskNode child)` thêm công việc con.",
      "- `boolean isLeaf()` kiểm tra không có con.",
      "- `List<TaskNode> getChildren()` trả về danh sách con.",
      "- `ProjectReport.countDone(TaskNode root)` đếm số node đã hoàn thành.",
      "- `ProjectReport.findLeafTitles(TaskNode root)` trả về tiêu đề các node lá theo thứ tự duyệt trước.",
      "- `ProjectReport.completionRate(TaskNode root)` trả về tỷ lệ hoàn thành theo phần trăm, làm tròn 1 chữ số thập phân.",
      "",
      "Không duyệt qua node `null`; cây rỗng có tỷ lệ hoàn thành `0.0`.",
    ].join("\n"),
    difficulty: "hard",
    oopTags: ["design-patterns", "composite", "tree"],
    starterCode: javaStarterFiles([
      {
        name: "ProjectReport.java",
        content: [
          "import java.util.*;",
          "",
          "class TaskNode {",
          "    private String title;",
          "    private boolean done;",
          "    private List<TaskNode> children = new ArrayList<>();",
          "    public TaskNode(String title, boolean done) { }",
          "    public String getTitle() { return title; }",
          "    public boolean isDone() { return done; }",
          "    public void setDone(boolean done) { this.done = done; }",
          "    public void addChild(TaskNode child) { }",
          "    public List<TaskNode> getChildren() { return children; }",
          "    public boolean isLeaf() { return false; }",
          "}",
          "",
          "public class ProjectReport {",
          "    public static int countDone(TaskNode root) { return 0; }",
          "    public static List<String> findLeafTitles(TaskNode root) { return new ArrayList<>(); }",
          "    public static double completionRate(TaskNode root) { return 0; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "ProjectReportTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.util.*;

public class ProjectReportTest {
    private TaskNode buildTree() {
        TaskNode root = new TaskNode("Build platform", true);
        TaskNode backend = new TaskNode("Backend", true);
        TaskNode frontend = new TaskNode("Frontend", false);
        backend.addChild(new TaskNode("API", true));
        backend.addChild(new TaskNode("Database", false));
        frontend.addChild(new TaskNode("Editor", false));
        root.addChild(backend);
        root.addChild(frontend);
        return root;
    }

    @Test
    public void compositeQueriesWork() {
        TaskNode root = buildTree();
        Assert.assertEquals(3, ProjectReport.countDone(root));
        Assert.assertEquals(Arrays.asList("API", "Database", "Editor"), ProjectReport.findLeafTitles(root));
        Assert.assertEquals(50.0, ProjectReport.completionRate(root), 0.0001);
    }

    @Test
    public void nullRootIsHandled() {
        Assert.assertEquals(0, ProjectReport.countDone(null));
        Assert.assertEquals(Collections.emptyList(), ProjectReport.findLeafTitles(null));
        Assert.assertEquals(0.0, ProjectReport.completionRate(null), 0.0001);
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 10 - Tính giảm giá với Strategy",
    description: [
      "# Tuần 10. Design Pattern: Strategy",
      "",
      "Cài đặt:",
      "- `interface DiscountStrategy` có `int discount(int subtotal)`.",
      "- `NoDiscountStrategy` không giảm giá.",
      "- `FixedDiscountStrategy(int amount)` giảm một số tiền cố định, không vượt quá subtotal.",
      "- `PercentageDiscountStrategy(int percent)` giảm theo phần trăm, làm tròn xuống.",
      "- `Checkout` nhận strategy qua constructor, có `setStrategy` và `int total(int subtotal)`.",
      "",
      "`Checkout.total` trả về `subtotal - discount`, không âm. Bài này kiểm tra khả năng thay đổi thuật toán ở runtime.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["design-patterns", "strategy"],
    starterCode: javaStarterFiles([
      {
        name: "Checkout.java",
        content: [
          "interface DiscountStrategy {",
          "    int discount(int subtotal);",
          "}",
          "",
          "class NoDiscountStrategy implements DiscountStrategy {",
          "    public int discount(int subtotal) { return 0; }",
          "}",
          "",
          "class FixedDiscountStrategy implements DiscountStrategy {",
          "    public FixedDiscountStrategy(int amount) { }",
          "    public int discount(int subtotal) { return 0; }",
          "}",
          "",
          "class PercentageDiscountStrategy implements DiscountStrategy {",
          "    public PercentageDiscountStrategy(int percent) { }",
          "    public int discount(int subtotal) { return 0; }",
          "}",
          "",
          "public class Checkout {",
          "    private DiscountStrategy strategy;",
          "    public Checkout(DiscountStrategy strategy) { this.strategy = strategy; }",
          "    public void setStrategy(DiscountStrategy strategy) { this.strategy = strategy; }",
          "    public int total(int subtotal) { return subtotal; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "CheckoutTest.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class CheckoutTest {
    @Test
    public void strategiesCalculateTotals() {
        Checkout checkout = new Checkout(new NoDiscountStrategy());
        Assert.assertEquals(1000, checkout.total(1000));
        checkout.setStrategy(new FixedDiscountStrategy(300));
        Assert.assertEquals(700, checkout.total(1000));
        Assert.assertEquals(0, checkout.total(200));
        checkout.setStrategy(new PercentageDiscountStrategy(15));
        Assert.assertEquals(850, checkout.total(1000));
        Assert.assertEquals(86, checkout.total(101));
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 10 - Adapter cảm biến nhiệt độ",
    description: [
      "# Tuần 10. Design Pattern: Adapter",
      "",
      "Cài đặt:",
      "- `interface TemperatureProvider` có `double readCelsius()`.",
      "- `LegacyFahrenheitSensor` có `double readFahrenheit()`.",
      "- `FahrenheitSensorAdapter implements TemperatureProvider`, bọc `LegacyFahrenheitSensor` và chuyển Fahrenheit sang Celsius.",
      "- `ClimateDashboard.averageCelsius(TemperatureProvider[] sensors)` trả về nhiệt độ trung bình Celsius, làm tròn 2 chữ số thập phân.",
      "",
      "Nếu mảng sensor rỗng hoặc null, trả về `0.0`.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["design-patterns", "adapter", "interfaces"],
    starterCode: javaStarterFiles([
      {
        name: "ClimateDashboard.java",
        content: [
          "interface TemperatureProvider {",
          "    double readCelsius();",
          "}",
          "",
          "class LegacyFahrenheitSensor {",
          "    private double fahrenheit;",
          "    public LegacyFahrenheitSensor(double fahrenheit) {",
          "        this.fahrenheit = fahrenheit;",
          "    }",
          "    public double readFahrenheit() {",
          "        return fahrenheit;",
          "    }",
          "}",
          "",
          "class FahrenheitSensorAdapter implements TemperatureProvider {",
          "    public FahrenheitSensorAdapter(LegacyFahrenheitSensor sensor) { }",
          "    public double readCelsius() { return 0; }",
          "}",
          "",
          "public class ClimateDashboard {",
          "    public static double averageCelsius(TemperatureProvider[] sensors) { return 0; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "ClimateDashboardTest.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class ClimateDashboardTest {
    private static class FixedCelsiusSensor implements TemperatureProvider {
        private final double value;
        FixedCelsiusSensor(double value) {
            this.value = value;
        }
        public double readCelsius() {
            return value;
        }
    }

    @Test
    public void adapterConvertsFahrenheitToCelsius() {
        TemperatureProvider freezing = new FahrenheitSensorAdapter(new LegacyFahrenheitSensor(32));
        TemperatureProvider warm = new FahrenheitSensorAdapter(new LegacyFahrenheitSensor(77));
        Assert.assertEquals(0.0, freezing.readCelsius(), 0.0001);
        Assert.assertEquals(25.0, warm.readCelsius(), 0.0001);
    }

    @Test
    public void dashboardUsesProviderInterfaceOnly() {
        TemperatureProvider[] sensors = {
            new FixedCelsiusSensor(20.0),
            new FahrenheitSensorAdapter(new LegacyFahrenheitSensor(68)),
            new FixedCelsiusSensor(21.25)
        };
        Assert.assertEquals(20.42, ClimateDashboard.averageCelsius(sensors), 0.0001);
        Assert.assertEquals(0.0, ClimateDashboard.averageCelsius(new TemperatureProvider[] {}), 0.0001);
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 2 - Giỏ hàng mini",
    description: [
      "# Tuần 2. Constructor, getter/setter và mảng đối tượng",
      "",
      "Cài đặt lớp `CartItem`:",
      "- Có thuộc tính `private String sku`, `private String name`, `private int unitPrice`, `private int quantity`.",
      "- Constructor `CartItem(String sku, String name, int unitPrice, int quantity)`.",
      "- Nếu `unitPrice` hoặc `quantity` âm thì đưa về `0`.",
      "- Getter/setter đầy đủ cho 4 thuộc tính. Setter cũng không nhận giá trị âm cho `unitPrice` và `quantity`.",
      "- `int subtotal()` trả về `unitPrice * quantity`.",
      "- `String toLine()` trả về `<sku> - <name> - <quantity> x <unitPrice> = <subtotal>`.",
      "",
      "Cài đặt lớp `ShoppingCart`:",
      "- Có mảng `items` kiểu `CartItem[]`, tối đa 50 phần tử.",
      "- `void addItem(CartItem item)` thêm mới nếu SKU chưa có; nếu trùng SKU thì cộng quantity.",
      "- `void removeItem(String sku)` xóa item theo SKU.",
      "- `int total()` trả về tổng tiền.",
      "- `String receipt()` trả về mỗi dòng là `toLine()` của item theo thứ tự thêm.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["classes", "objects", "arrays", "constructor"],
    starterCode: javaStarterFiles([
      {
        name: "CartItem.java",
        content: [
          "public class CartItem {",
          "    private String sku;",
          "    private String name;",
          "    private int unitPrice;",
          "    private int quantity;",
          "",
          "    public CartItem(String sku, String name, int unitPrice, int quantity) {",
          "        // TODO",
          "    }",
          "",
          "    public String getSku() { return sku; }",
          "    public void setSku(String sku) { this.sku = sku; }",
          "    public String getName() { return name; }",
          "    public void setName(String name) { this.name = name; }",
          "    public int getUnitPrice() { return unitPrice; }",
          "    public void setUnitPrice(int unitPrice) { }",
          "    public int getQuantity() { return quantity; }",
          "    public void setQuantity(int quantity) { }",
          "    public int subtotal() { return 0; }",
          "    public String toLine() { return \"\"; }",
          "}",
        ].join("\n"),
      },
      {
        name: "ShoppingCart.java",
        content: [
          "public class ShoppingCart {",
          "    private CartItem[] items = new CartItem[50];",
          "    private int itemCount = 0;",
          "",
          "    public void addItem(CartItem item) {",
          "        // TODO",
          "    }",
          "",
          "    public void removeItem(String sku) {",
          "        // TODO",
          "    }",
          "",
          "    public int total() {",
          "        // TODO",
          "        return 0;",
          "    }",
          "",
          "    public String receipt() {",
          "        // TODO",
          "        return \"\";",
          "    }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "ShoppingCartTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.lang.reflect.Modifier;

public class ShoppingCartTest {
    @Test
    public void cartItemClampsNegativeValues() throws Exception {
        Assert.assertTrue(Modifier.isPrivate(CartItem.class.getDeclaredField("sku").getModifiers()));
        CartItem item = new CartItem("B01", "Book", -10, -2);
        Assert.assertEquals(0, item.getUnitPrice());
        Assert.assertEquals(0, item.getQuantity());
        item.setUnitPrice(120);
        item.setQuantity(3);
        Assert.assertEquals(360, item.subtotal());
        Assert.assertEquals("B01 - Book - 3 x 120 = 360", item.toLine());
    }

    @Test
    public void cartMergesDuplicateSkuAndRemovesItems() {
        ShoppingCart cart = new ShoppingCart();
        cart.addItem(new CartItem("B01", "Book", 120, 2));
        cart.addItem(new CartItem("P01", "Pen", 10, 5));
        cart.addItem(new CartItem("B01", "Book", 120, 1));
        Assert.assertEquals(410, cart.total());
        Assert.assertEquals("B01 - Book - 3 x 120 = 360\\nP01 - Pen - 5 x 10 = 50", cart.receipt().trim());
        cart.removeItem("B01");
        Assert.assertEquals(50, cart.total());
        Assert.assertEquals("P01 - Pen - 5 x 10 = 50", cart.receipt().trim());
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 4 - Nhân sự và lương theo giờ",
    description: [
      "# Tuần 4. Kế thừa và overriding",
      "",
      "Cài đặt hai lớp:",
      "",
      "## `StaffMember`",
      "- Thuộc tính `protected String id`, `protected String name`, `protected int baseSalary`.",
      "- Constructor `StaffMember(String id, String name, int baseSalary)`; nếu lương âm thì đưa về `0`.",
      "- `int monthlyPay()` trả về `baseSalary`.",
      "- `String summary()` trả về `Staff <id> - <name> - pay <monthlyPay>`.",
      "",
      "## `HourlyStaff extends StaffMember`",
      "- Thuộc tính `private int hourlyRate`, `private int hoursWorked`.",
      "- Constructor `HourlyStaff(String id, String name, int hourlyRate, int hoursWorked)` gọi super với baseSalary bằng `0`.",
      "- Nếu `hourlyRate` hoặc `hoursWorked` âm thì đưa về `0`.",
      "- Override `monthlyPay()` trả về `hourlyRate * hoursWorked`.",
      "- Override `summary()` trả về `Hourly <id> - <name> - pay <monthlyPay>`.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["inheritance", "constructor", "overriding"],
    starterCode: javaStarterFiles([
      {
        name: "StaffMember.java",
        content: [
          "public class StaffMember {",
          "    protected String id;",
          "    protected String name;",
          "    protected int baseSalary;",
          "",
          "    public StaffMember(String id, String name, int baseSalary) {",
          "        // TODO",
          "    }",
          "",
          "    public int monthlyPay() { return 0; }",
          "    public String summary() { return \"\"; }",
          "}",
        ].join("\n"),
      },
      {
        name: "HourlyStaff.java",
        content: [
          "public class HourlyStaff extends StaffMember {",
          "    private int hourlyRate;",
          "    private int hoursWorked;",
          "",
          "    public HourlyStaff(String id, String name, int hourlyRate, int hoursWorked) {",
          "        super(id, name, 0);",
          "        // TODO",
          "    }",
          "",
          "    public int getHourlyRate() { return hourlyRate; }",
          "    public int getHoursWorked() { return hoursWorked; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "StaffMemberTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.lang.reflect.Modifier;

public class StaffMemberTest {
    @Test
    public void baseStaffUsesBaseSalary() throws Exception {
        Assert.assertTrue(Modifier.isProtected(StaffMember.class.getDeclaredField("id").getModifiers()));
        StaffMember staff = new StaffMember("S01", "An", 900);
        Assert.assertEquals(900, staff.monthlyPay());
        Assert.assertEquals("Staff S01 - An - pay 900", staff.summary());
        Assert.assertEquals(0, new StaffMember("S02", "Binh", -1).monthlyPay());
    }

    @Test
    public void hourlyStaffOverridesPayAndSummary() {
        Assert.assertEquals(StaffMember.class, HourlyStaff.class.getSuperclass());
        HourlyStaff staff = new HourlyStaff("H01", "Chi", 25, 32);
        Assert.assertEquals(800, staff.monthlyPay());
        Assert.assertEquals("Hourly H01 - Chi - pay 800", staff.summary());
        Assert.assertEquals(0, new HourlyStaff("H02", "Dung", -5, 10).monthlyPay());
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 6 - Bộ đọc cấu hình",
    description: [
      "# Tuần 6. Exception và kiểm tra dữ liệu",
      "",
      "Cài đặt:",
      "- `ConfigException extends Exception`.",
      "- `AppConfig` lưu `host`, `port`, `secure` và có `toString()` trả về `<host>:<port> secure=<secure>`.",
      "- `ConfigLoader.parse(String line)` nhận chuỗi dạng `host=localhost;port=8080;secure=true`.",
      "- Thiếu `host`, `port`, hoặc `secure` thì ném `ConfigException` với thông điệp `Missing key`.",
      "- `port` không phải số hoặc ngoài `1..65535` thì ném `ConfigException` với thông điệp `Invalid port`.",
      "- `secure` chỉ nhận `true` hoặc `false`; sai thì ném `ConfigException` với thông điệp `Invalid secure flag`.",
      "- `ConfigLoader.describe(String line)` trả về `toString()` nếu hợp lệ; nếu lỗi trả về `Config error: <message>`.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["exception-handling", "parsing", "custom-exception"],
    starterCode: javaStarterFiles([
      {
        name: "ConfigLoader.java",
        content: [
          "class ConfigException extends Exception {",
          "    public ConfigException(String message) {",
          "        super(message);",
          "    }",
          "}",
          "",
          "class AppConfig {",
          "    private String host;",
          "    private int port;",
          "    private boolean secure;",
          "    public AppConfig(String host, int port, boolean secure) { }",
          "    public String getHost() { return host; }",
          "    public int getPort() { return port; }",
          "    public boolean isSecure() { return secure; }",
          "    public String toString() { return \"\"; }",
          "}",
          "",
          "public class ConfigLoader {",
          "    public static AppConfig parse(String line) throws ConfigException {",
          "        return null;",
          "    }",
          "",
          "    public static String describe(String line) {",
          "        return \"\";",
          "    }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "ConfigLoaderTest.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class ConfigLoaderTest {
    @Test
    public void validConfigIsParsed() throws Exception {
        AppConfig config = ConfigLoader.parse("host=localhost;port=8080;secure=true");
        Assert.assertEquals("localhost", config.getHost());
        Assert.assertEquals(8080, config.getPort());
        Assert.assertTrue(config.isSecure());
        Assert.assertEquals("localhost:8080 secure=true", ConfigLoader.describe("host=localhost;port=8080;secure=true"));
    }

    @Test
    public void invalidConfigIsReported() {
        Assert.assertEquals("Config error: Missing key", ConfigLoader.describe("host=localhost;secure=false"));
        Assert.assertEquals("Config error: Invalid port", ConfigLoader.describe("host=localhost;port=70000;secure=false"));
        Assert.assertEquals("Config error: Invalid secure flag", ConfigLoader.describe("host=localhost;port=8080;secure=yes"));
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Tuần 9 - Chỉ mục hashtag",
    description: [
      "# Tuần 9. String, Set và Map",
      "",
      "Cài đặt lớp `HashtagIndex`:",
      "- `List<String> extractTags(String text)` trả về các hashtag trong text, bỏ ký tự `#`, chuyển về chữ thường.",
      "- Hashtag chỉ gồm chữ cái, chữ số hoặc `_`; dừng khi gặp ký tự khác.",
      "- `Map<String, Integer> tagFrequency(List<String> posts)` đếm tần suất tag, giữ thứ tự tag xuất hiện đầu tiên.",
      "- `String trending(List<String> posts, int limit)` trả về các dòng `tag=count`, sắp xếp giảm dần theo count; nếu bằng nhau giữ thứ tự xuất hiện.",
      "",
      "Bỏ qua ký tự `#` không có tag phía sau.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["strings", "collections", "map", "set"],
    starterCode: javaStarterFiles([
      {
        name: "HashtagIndex.java",
        content: [
          "import java.util.*;",
          "",
          "public class HashtagIndex {",
          "    public static List<String> extractTags(String text) { return new ArrayList<>(); }",
          "    public static Map<String, Integer> tagFrequency(List<String> posts) { return new LinkedHashMap<>(); }",
          "    public static String trending(List<String> posts, int limit) { return \"\"; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "HashtagIndexTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.util.*;

public class HashtagIndexTest {
    @Test
    public void tagsAreExtractedAndNormalized() {
        Assert.assertEquals(
            Arrays.asList("java", "oop_2026", "java"),
            HashtagIndex.extractTags("Learning #Java with #oop_2026! #JAVA #")
        );
    }

    @Test
    public void frequencyKeepsFirstAppearanceOrder() {
        Map<String, Integer> counts = HashtagIndex.tagFrequency(Arrays.asList("#java #oop", "#java #clean_code", "#oop"));
        Assert.assertEquals(Arrays.asList("java", "oop", "clean_code"), new ArrayList<>(counts.keySet()));
        Assert.assertEquals(Integer.valueOf(2), counts.get("java"));
        Assert.assertEquals(Integer.valueOf(2), counts.get("oop"));
    }

    @Test
    public void trendingSortsByCountThenAppearance() {
        Assert.assertEquals(
            "java=3\\noop=2",
            HashtagIndex.trending(Arrays.asList("#java #oop", "#java", "#oop #java #test"), 2)
        );
    }
}
        `,
        100,
        1
      ),
    ],
  },
  {
    title: "Bài tập lớn - Quản lý Chi tiêu Cá nhân",
    description: [
      "Bài tập lớn Lập trình Hướng đối tượng",
      "Phát triển ứng dụng Quản lý Chi tiêu Cá nhân (Personal Expense Manager) bằng Java",
      "",
      "Ghi chú: sinh viên được phép bổ sung lớp/hàm cần thiết và tự tổ chức cấu trúc chương trình. Có thể dùng thư viện Java bên ngoài nếu cần. Sinh viên có thể chọn phiên bản dòng lệnh (tối đa 6.5 điểm) hoặc phiên bản giao diện đồ họa (tối đa 10 điểm). Nếu một thành viên bất kỳ không trả lời được câu hỏi về bài làm, nhóm có thể bị xem là không hiểu bài và nhận 0 điểm.",
      "",
      "1. Giới thiệu",
      "Xây dựng ứng dụng quản lý chi tiêu cá nhân: ghi lại khoản thu/chi, phân loại danh mục, quản lý ví/tài khoản, đặt hạn mức ngân sách và thống kê. Bài toán có cây kế thừa và tính đa hình rõ ràng, phù hợp áp dụng đầy đủ 4 nguyên tắc OOP.",
      "",
      "2. Mục tiêu",
      "- Áp dụng đóng gói, kế thừa, đa hình, trừu tượng hóa.",
      "- Phân tích, thiết kế lớp và tổ chức chương trình rõ ràng, dễ mở rộng.",
      "- Làm việc với đọc/ghi file, xử lý ngoại lệ.",
      "- Rèn kỹ năng làm việc nhóm và quản lý mã nguồn bằng Git.",
      "",
      "3. Yêu cầu chung",
      "- Đơn vị tiền tệ mặc định là VND.",
      "- Bắt buộc dùng GitHub và commit thường xuyên; không chấp nhận repository chỉ có một commit cuối kỳ.",
      "- Khuyến khích dùng Collection, Enum, Interface và tách lớp lưu trữ.",
      "",
      "4. Phiên bản dòng lệnh cơ bản",
      "Xây dựng menu tương tác:",
      "[0] Exit",
      "[1] Add Transaction",
      "[2] Remove Transaction",
      "[3] Update Transaction",
      "[4] Find Transaction",
      "[5] Display All Transactions",
      "[6] Manage Category",
      "[7] Manage Wallet",
      "[8] Monthly Summary",
      "[9] Set / Check Budget",
      "Nếu nhập số ngoài [0-9] hoặc ký tự không hợp lệ, in ra \"Action is not supported\".",
      "",
      "Chức năng bắt buộc:",
      "- Quản lý giao dịch: thêm, xóa, sửa, tìm kiếm theo danh mục/ngày/số tiền.",
      "- Quản lý danh mục và ví/tài khoản: thêm danh mục thu/chi; thêm ví, xem số dư.",
      "- Thống kê cơ bản: tổng thu, tổng chi, số dư theo tháng.",
      "- Xử lý lỗi: số tiền âm, ngày sai định dạng, danh mục không tồn tại, chi vượt số dư ví nếu bật kiểm tra.",
      "",
      "5. Phiên bản dòng lệnh nâng cấp",
      "- Đọc/ghi file CSV hoặc JSON.",
      "- Hạn mức ngân sách theo danh mục/tháng.",
      "- Thống kê theo danh mục, theo tháng, khoản chi lớn nhất/nhỏ nhất, top danh mục tốn kém.",
      "- Giao dịch định kỳ như tiền nhà, internet.",
      "",
      "6. Phiên bản GUI không bắt buộc",
      "- Swing hoặc JavaFX.",
      "- Bảng giao dịch, form thêm/sửa/xóa.",
      "- Dashboard tổng thu/chi/số dư, cảnh báo ngân sách.",
      "- Biểu đồ tỷ trọng chi tiêu theo danh mục/tháng.",
      "- Dùng đa luồng cho tác vụ nặng để UI không bị treo.",
      "",
      "7. Thiết kế OOP gợi ý",
      "Transaction (abstract) -> Income, Expense -> RecurringExpense",
      "Wallet (abstract) -> CashWallet, BankAccount, EWallet",
      "Storage (interface) -> CsvStorage, JsonStorage",
      "Enum: TransactionType, WalletType, Period",
      "Composition: Category, Budget, ExpenseManager, ConsoleView/AppView",
      "",
      "Các lớp chính:",
      "- Transaction: id, amount, date, note, category, wallet; getType(), getSignedAmount(), printInfo().",
      "- Income: source; getSignedAmount() trả về +amount.",
      "- Expense: paymentMethod; getSignedAmount() trả về -amount.",
      "- RecurringExpense: period; nextDueDate().",
      "- Wallet: name, balance; deposit(), withdraw(), getWalletType().",
      "- Budget: category, limit, period; isExceeded().",
      "- ExpenseManager: quản lý transaction, wallet, category, budget; add/remove/update/find, monthlySummary(), statisticsByCategory().",
      "",
      "8. Chất lượng code",
      "- Tên lớp PascalCase, biến/phương thức camelCase, dùng tiếng Anh.",
      "- Tuân thủ Google Java Style Guide.",
      "- Có comment cho logic quan trọng.",
      "- Có JUnit cho logic chính: thống kê, budget, ví, giao dịch.",
      "- Khuyến khích Design Pattern: Singleton, Factory Method, Strategy.",
      "",
      "9. Chấm điểm",
      "- Thiết kế lớp và cây kế thừa: 2.0 điểm.",
      "- Áp dụng 4 nguyên tắc OOP: 0.5 điểm.",
      "- Chức năng chính dòng lệnh: 2.0 điểm.",
      "- Xử lý lỗi và giao diện dòng lệnh: 0.5 điểm.",
      "- Lưu trữ, budget, recurring: 0.5 điểm.",
      "- Chất lượng code: 0.5 điểm.",
      "- Trình bày và hỏi đáp: 0.5 điểm.",
      "- GUI: tối đa 3.5 điểm.",
      "- Bonus: UML/class diagram +0.5; dùng hợp lý Collection + Enum + Interface +0.5.",
      "",
      "Yêu cầu nộp bài:",
      "- Nộp URL repository GitHub của nhóm.",
      "- Repository để private và thêm tài khoản oasis-uet làm collaborator.",
      "- Không đẩy thư mục .idea, target, out hoặc file build lên repository.",
    ].join("\n"),
    difficulty: "hard",
    oopTags: ["project", "oop-design", "inheritance", "io", "teamwork"],
    starterCode: "",
    testCasesData: [],
  },
];

async function seedExercises() {
  console.log("Seeding OOP practice exercise library...");

  await ensureDatabaseCompatibility(db);

  const now = new Date().toISOString();
  let testCaseCount = 0;
  const seededExerciseIds: Array<{ id: string; title: string }> = [];

  for (const seed of exerciseSeeds) {
    const exerciseId = stableId(seed.title);

    await db
      .insert(exercises)
      .values({
        id: exerciseId,
        title: seed.title,
        description: seed.description,
        difficulty: seed.difficulty,
        starterCode: seed.starterCode,
        isLibrary: 1,
        oopTags: JSON.stringify(seed.oopTags),
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: exercises.id,
        set: {
          title: seed.title,
          description: seed.description,
          difficulty: seed.difficulty,
          starterCode: seed.starterCode,
          isLibrary: 1,
          oopTags: JSON.stringify(seed.oopTags),
          updatedAt: now,
        },
      });
    seededExerciseIds.push({ id: exerciseId, title: seed.title });

    for (const [index, tc] of seed.testCasesData.entries()) {
      await db
        .insert(testCases)
        .values({
          id: `${exerciseId}-tc-${index + 1}`,
          exerciseId,
          inputData: tc.inputData,
          expectedOutput: tc.expectedOutput,
          isVisible: tc.isVisible,
          pointValue: tc.pointValue,
          timeLimitSeconds: tc.timeLimitSeconds ?? 10,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: testCases.id,
          set: {
            inputData: tc.inputData,
            expectedOutput: tc.expectedOutput,
            isVisible: tc.isVisible,
            pointValue: tc.pointValue,
            timeLimitSeconds: tc.timeLimitSeconds ?? 10,
          },
        });
      testCaseCount++;
    }

    console.log(`  - ${seed.title} (${seed.difficulty}) [${seed.oopTags.join(", ")}]`);
  }

  const sections = await db.select({ id: classSections.id }).from(classSections);
  let assignmentCount = 0;
  for (const section of sections) {
    for (const exercise of seededExerciseIds) {
      const week = weekFromTitle(exercise.title);
      if (!week) {
        continue;
      }
      await db
        .insert(exerciseAssignments)
        .values({
          id: crypto.randomUUID(),
          exerciseId: exercise.id,
          sectionId: section.id,
          deadline: null,
          isAssessment: isDefaultAssessment(exercise.title),
          isVisible: isDefaultVisible(exercise.title),
          allowSubmission: 1,
          maxSubmissions: null,
          week,
          assignedAt: now,
        })
        .onConflictDoUpdate({
          target: [exerciseAssignments.exerciseId, exerciseAssignments.sectionId],
          set: {
            isAssessment: isDefaultAssessment(exercise.title),
            week,
          },
        });
      assignmentCount++;
    }
  }

  console.log("");
  console.log("Exercise library seeded successfully.");
  console.log(`Total exercises: ${exerciseSeeds.length}`);
  console.log(`Total test cases: ${testCaseCount}`);
  console.log(`Default assignments created: ${assignmentCount}`);
  console.log("Topics covered: Java basics, class/object, primitive/static, inheritance, polymorphism, exception, IO, collections, generics, design patterns.");
  process.exit(0);
}

seedExercises().catch((error) => {
  console.error("Exercise seeding failed:", error);
  process.exit(1);
});
