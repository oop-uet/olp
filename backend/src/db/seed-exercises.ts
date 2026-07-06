import "dotenv/config";
import { inArray, eq } from "drizzle-orm";
import crypto from "node:crypto";
import { db } from "./index.js";
import {
  anticheatEvents,
  classSections,
  exerciseAssignments,
  exercises,
  projectGroupMembers,
  projectGroups,
  submissionResults,
  submissions,
  testCases,
} from "./schema.js";

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
  return title.includes("Quản lý sinh viên") || title.includes("Phân số") ? 1 : 0;
}

const studentManagementTest = `
import net.bqc.oasis.junit.JavaReflection;
import org.junit.Assert;
import org.junit.BeforeClass;
import org.junit.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

public class MyTest {
    static Method setNameMethod;
    static Method setIdMethod;
    static Method setGroupMethod;
    static Method setEmailMethod;
    static Method getInfoMethod;
    static Method getNameMethod;
    static Method getIdMethod;
    static Method getGroupMethod;
    static Method getEmailMethod;
    static Method sameGroupMethod;
    static Method addStudentMethod;
    static Method studentsByGroupMethod;
    static Method removeStudentMethod;

    @BeforeClass
    public static void init() {
        setNameMethod = JavaReflection.getMethod(Student.class, "setName", void.class, "", "", String.class);
        setIdMethod = JavaReflection.getMethod(Student.class, "setId", void.class, "", "", String.class);
        setGroupMethod = JavaReflection.getMethod(Student.class, "setGroup", void.class, "", "", String.class);
        setEmailMethod = JavaReflection.getMethod(Student.class, "setEmail", void.class, "", "", String.class);
        getInfoMethod = JavaReflection.getMethod(Student.class, "getInfo", String.class, "", "");
        getNameMethod = JavaReflection.getMethod(Student.class, "getName", String.class, "", "");
        getIdMethod = JavaReflection.getMethod(Student.class, "getId", String.class, "", "");
        getGroupMethod = JavaReflection.getMethod(Student.class, "getGroup", String.class, "", "");
        getEmailMethod = JavaReflection.getMethod(Student.class, "getEmail", String.class, "", "");
        sameGroupMethod = JavaReflection.getMethod(StudentManagement.class, "sameGroup", boolean.class, "", "static", Student.class, Student.class);
        addStudentMethod = JavaReflection.getMethod(StudentManagement.class, "addStudent", void.class, "", "", Student.class);
        studentsByGroupMethod = JavaReflection.getMethod(StudentManagement.class, "studentsByGroup", String.class, "", "");
        removeStudentMethod = JavaReflection.getMethod(StudentManagement.class, "removeStudent", void.class, "", "", String.class);
    }

    @Test
    public void studentFieldsArePrivateStrings() {
        Assert.assertTrue(JavaReflection.checkField(Student.class, "name", "String|java.lang.String", "private"));
        Assert.assertTrue(JavaReflection.checkField(Student.class, "id", "String|java.lang.String", "private"));
        Assert.assertTrue(JavaReflection.checkField(Student.class, "group", "String|java.lang.String", "private"));
        Assert.assertTrue(JavaReflection.checkField(Student.class, "email", "String|java.lang.String", "private"));
    }

    @Test
    public void constructorsAndAccessorsWork() throws Exception {
        Student defaultStudent = new Student();
        Assert.assertEquals("Student - 000 - K62CB - uet@vnu.edu.vn", getInfoMethod.invoke(defaultStudent));

        Constructor<Student> constructor = Student.class.getDeclaredConstructor(String.class, String.class, String.class);
        Student s1 = constructor.newInstance("Nguyen Van An", "17020001", "17020001@vnu.edu.vn");
        Assert.assertEquals("Nguyen Van An - 17020001 - K62CB - 17020001@vnu.edu.vn", getInfoMethod.invoke(s1));

        s1.setGroup("K62CC");
        Student copy = new Student(s1);
        Assert.assertEquals("Nguyen Van An - 17020001 - K62CC - 17020001@vnu.edu.vn", copy.getInfo());
    }

    @Test
    public void studentManagementGroupsAndRemovesStudents() throws Exception {
        Field studentsField = JavaReflection.getField(StudentManagement.class, "students");
        Assert.assertNotNull(studentsField);
        Assert.assertTrue(studentsField.getType().isArray());

        StudentManagement sm = new StudentManagement();
        Student s1 = new Student("Nguyen Van An", "17020001", "17020001@vnu.edu.vn");
        Student s2 = new Student("Nguyen Van B", "17020002", "17020002@vnu.edu.vn");
        Student s3 = new Student("Nguyen Van C", "17020003", "17020003@vnu.edu.vn");
        Student s4 = new Student("Nguyen Van D", "17020004", "17020004@vnu.edu.vn");
        s1.setGroup("K62CC");
        s2.setGroup("K62CC");

        Assert.assertTrue(StudentManagement.sameGroup(s1, s2));
        Assert.assertFalse(StudentManagement.sameGroup(s1, s3));

        sm.addStudent(s1);
        sm.addStudent(s2);
        sm.addStudent(s3);
        sm.addStudent(s4);
        Assert.assertEquals(
            "K62CC\\nNguyen Van An - 17020001 - K62CC - 17020001@vnu.edu.vn\\nNguyen Van B - 17020002 - K62CC - 17020002@vnu.edu.vn\\nK62CB\\nNguyen Van C - 17020003 - K62CB - 17020003@vnu.edu.vn\\nNguyen Van D - 17020004 - K62CB - 17020004@vnu.edu.vn",
            sm.studentsByGroup().trim()
        );

        sm.removeStudent("17020002");
        Assert.assertEquals(
            "K62CC\\nNguyen Van An - 17020001 - K62CC - 17020001@vnu.edu.vn\\nK62CB\\nNguyen Van C - 17020003 - K62CB - 17020003@vnu.edu.vn\\nNguyen Van D - 17020004 - K62CB - 17020004@vnu.edu.vn",
            sm.studentsByGroup().trim()
        );
    }
}
`;

const exerciseSeeds: ExerciseSeed[] = [
  {
    title: "Tuần 1 - Hello World và tham số dòng lệnh",
    description: [
      "# Tuần 1. Cài đặt môi trường Java",
      "",
      "Bài này tương ứng với slide `1.1-Gioi thieu ve Java.pdf` và phần Tuần 1 trong `Thực hành OOP.pdf`.",
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
      stdoutCase("", "Hello World", 40),
      stdoutCase("An", "Hello World\nHello An", 60, 0),
    ],
  },
  {
    title: "Tuần 1 - Robot và Engine",
    description: [
      "# Tuần 1. Khái niệm lập trình hướng đối tượng",
      "",
      "Bài này bổ sung cho module `Java Introduction + Object Oriented Programming Concept` trong `timeline.md`, dựa trên ví dụ robot/engine trong slide `2.0_OOP_Intro.pdf`.",
      "",
      "## Yêu cầu",
      "- Cài đặt lớp `Engine` có thuộc tính `private String serialNumber`, `private int power`.",
      "- `Engine(String serialNumber, int power)` khởi tạo động cơ. Nếu `power < 0`, đưa về `0`.",
      "- `void setPower(int power)` cập nhật công suất, không cho giá trị âm.",
      "- `String getSerialNumber()` và `int getPower()`.",
      "- Cài đặt lớp `HouseBot` có `private String id`, `private String name`, `private Engine engine`.",
      "- `HouseBot(String id, String name, Engine engine)` khởi tạo robot.",
      "- `String forward()` trả về `Robot <name> moves forward with power <power>`.",
      "- `String turnLeft()` trả về `Robot <name> turns left`.",
      "- `String cleanUp()` trả về `Robot <name> cleans the room`.",
      "",
      "Bài này kiểm tra khả năng tách đối tượng theo trạng thái/hành vi và quan hệ has-a giữa `HouseBot` và `Engine`.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["oop-concepts", "composition", "classes"],
    starterCode: javaStarterFiles([
      {
        name: "Engine.java",
        content: [
          "public class Engine {",
          "    private String serialNumber;",
          "    private int power;",
          "",
          "    public Engine(String serialNumber, int power) {",
          "        // TODO",
          "    }",
          "",
          "    public String getSerialNumber() { return serialNumber; }",
          "    public int getPower() { return power; }",
          "    public void setPower(int power) {",
          "        // TODO",
          "    }",
          "}",
        ].join("\n"),
      },
      {
        name: "HouseBot.java",
        content: [
          "public class HouseBot {",
          "    private String id;",
          "    private String name;",
          "    private Engine engine;",
          "",
          "    public HouseBot(String id, String name, Engine engine) {",
          "        // TODO",
          "    }",
          "",
          "    public String forward() { return \"\"; }",
          "    public String turnLeft() { return \"\"; }",
          "    public String cleanUp() { return \"\"; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "RobotTest.java",
        `
import net.bqc.oasis.junit.JavaReflection;
import org.junit.Assert;
import org.junit.Test;

public class RobotTest {
    @Test
    public void fieldsArePrivateAndCompositionIsUsed() {
        Assert.assertTrue(JavaReflection.checkField(Engine.class, "serialNumber", "String|java.lang.String", "private"));
        Assert.assertTrue(JavaReflection.checkField(Engine.class, "power", "int", "private"));
        Assert.assertTrue(JavaReflection.checkField(HouseBot.class, "id", "String|java.lang.String", "private"));
        Assert.assertTrue(JavaReflection.checkField(HouseBot.class, "name", "String|java.lang.String", "private"));
        Assert.assertTrue(JavaReflection.checkField(HouseBot.class, "engine", "Engine", "private"));
    }

    @Test
    public void behaviorUsesObjectState() {
        Engine engine = new Engine("E-01", 75);
        HouseBot bot = new HouseBot("HB-01", "Mika", engine);
        Assert.assertEquals("E-01", engine.getSerialNumber());
        Assert.assertEquals(75, engine.getPower());
        Assert.assertEquals("Robot Mika moves forward with power 75", bot.forward());
        Assert.assertEquals("Robot Mika turns left", bot.turnLeft());
        Assert.assertEquals("Robot Mika cleans the room", bot.cleanUp());
    }

    @Test
    public void negativePowerIsClampedToZero() {
        Engine engine = new Engine("E-02", -10);
        Assert.assertEquals(0, engine.getPower());
        engine.setPower(-5);
        Assert.assertEquals(0, engine.getPower());
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 2 - Quản lý sinh viên",
    description: [
      "# Tuần 2. Setter/Getter, Constructor",
      "",
      "Bài này được rà soát theo đúng nội dung bài `Quản lý sinh viên` trong `Thực hành OOP.pdf` và bộ test reflection `exercises/testcase/StudentManagement/MyTest.java`.",
      "",
      "## Lớp `Student`",
      "- Có 4 thuộc tính `private String`: `name`, `id`, `group`, `email`.",
      "- Constructor mặc định tạo sinh viên `Student - 000 - K62CB - uet@vnu.edu.vn`.",
      "- Constructor `Student(String name, String id, String email)` đặt `group` mặc định là `K62CB`.",
      "- Constructor sao chép `Student(Student s)` sao chép đầy đủ thông tin.",
      "- Có getter/setter cho đủ 4 thuộc tính.",
      "- `getInfo()` trả về `<name> - <id> - <group> - <email>`.",
      "",
      "## Lớp `StudentManagement`",
      "- Có mảng `students` kiểu `Student[]`, kích thước từ 4 đến 100.",
      "- `static boolean sameGroup(Student s1, Student s2)` kiểm tra cùng lớp.",
      "- `void addStudent(Student newStudent)` thêm sinh viên.",
      "- `String studentsByGroup()` nhóm sinh viên theo `group`, giữ thứ tự nhóm xuất hiện đầu tiên.",
      "- `void removeStudent(String id)` xóa sinh viên theo mã sinh viên.",
      "",
      "Bộ chấm dùng reflection nên tên lớp, tên phương thức, kiểu trả về và modifier phải khớp chính xác.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["classes", "objects", "encapsulation", "constructor"],
    starterCode: javaStarterFiles([
      {
        name: "Student.java",
        content: [
          "public class Student {",
          "    private String name;",
          "    private String id;",
          "    private String group;",
          "    private String email;",
          "",
          "    public Student() {",
          "        // TODO",
          "    }",
          "",
          "    public Student(String name, String id, String email) {",
          "        // TODO",
          "    }",
          "",
          "    public Student(Student s) {",
          "        // TODO",
          "    }",
          "",
          "    public String getName() { return name; }",
          "    public void setName(String name) { this.name = name; }",
          "    public String getId() { return id; }",
          "    public void setId(String id) { this.id = id; }",
          "    public String getGroup() { return group; }",
          "    public void setGroup(String group) { this.group = group; }",
          "    public String getEmail() { return email; }",
          "    public void setEmail(String email) { this.email = email; }",
          "",
          "    public String getInfo() {",
          "        // TODO",
          "        return \"\";",
          "    }",
          "}",
        ].join("\n"),
      },
      {
        name: "StudentManagement.java",
        content: [
          "public class StudentManagement {",
          "    Student[] students = new Student[100];",
          "    private int studentCount = 0;",
          "",
          "    public static boolean sameGroup(Student s1, Student s2) {",
          "        // TODO",
          "        return false;",
          "    }",
          "",
          "    public void addStudent(Student newStudent) {",
          "        // TODO",
          "    }",
          "",
          "    public String studentsByGroup() {",
          "        // TODO",
          "        return \"\";",
          "    }",
          "",
          "    public void removeStudent(String id) {",
          "        // TODO",
          "    }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [javaTestCase("MyTest.java", studentManagementTest, 100)],
  },
  {
    title: "Tuần 3 - Ước số, Fibonacci và sàng Eratosthenes",
    description: [
      "# Tuần 3. Kiểu dữ liệu nguyên thủy và phương thức tĩnh",
      "",
      "Tương ứng slide `3.1_HieuThem_Java-1.pdf` và Tuần 3 trong tài liệu thực hành.",
      "",
      "Cài đặt lớp `Week3` với các phương thức `public static`:",
      "- `int gcd(int a, int b)`: trả về ước số chung lớn nhất của hai số nguyên. Kết quả luôn không âm.",
      "- `long fibonacci(int n)`: trả về số Fibonacci thứ `n`, với `fibonacci(0) = 0`, `fibonacci(1) = 1`.",
      "- `String sieveEratosthenes(int n)`: trả về các số nguyên tố từ 2 đến `n`, cách nhau bởi một dấu cách. Nếu không có số nguyên tố, trả về chuỗi rỗng.",
      "",
      "Không sử dụng thư viện ngoài. Cần xử lý tốt các giá trị biên như `0`, số âm trong `gcd`, và `n < 2`.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["primitive-types", "static-methods", "algorithm"],
    starterCode: javaStarterFiles([
      {
        name: "Week3.java",
        content: [
          "public class Week3 {",
          "    public static int gcd(int a, int b) {",
          "        // TODO",
          "        return 0;",
          "    }",
          "",
          "    public static long fibonacci(int n) {",
          "        // TODO",
          "        return 0;",
          "    }",
          "",
          "    public static String sieveEratosthenes(int n) {",
          "        // TODO",
          "        return \"\";",
          "    }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "Week3Test.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class Week3Test {
    @Test
    public void testGcd() {
        Assert.assertEquals(6, Week3.gcd(54, 24));
        Assert.assertEquals(7, Week3.gcd(-21, 14));
        Assert.assertEquals(5, Week3.gcd(0, 5));
        Assert.assertEquals(0, Week3.gcd(0, 0));
    }

    @Test
    public void testFibonacci() {
        Assert.assertEquals(0L, Week3.fibonacci(0));
        Assert.assertEquals(1L, Week3.fibonacci(1));
        Assert.assertEquals(55L, Week3.fibonacci(10));
        Assert.assertEquals(6765L, Week3.fibonacci(20));
    }

    @Test
    public void testSieve() {
        Assert.assertEquals("", Week3.sieveEratosthenes(1));
        Assert.assertEquals("2", Week3.sieveEratosthenes(2));
        Assert.assertEquals("2 3 5 7 11 13 17 19", Week3.sieveEratosthenes(20));
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 3 - Phân số",
    description: [
      "# Tuần 3. Lớp `Fraction` và so sánh đối tượng",
      "",
      "Dựa trên phần Phân số trong `Thực hành OOP.pdf` và nội dung slide về class/object, primitive type, `equals`.",
      "",
      "Cài đặt lớp `Fraction`:",
      "- Thuộc tính `private int numerator`, `private int denominator`.",
      "- Constructor `Fraction(int numerator, int denominator)`. Nếu mẫu bằng 0 thì ném `ArithmeticException` với thông điệp `Denominator is zero`.",
      "- Getter/setter cho tử và mẫu. Setter mẫu cũng phải kiểm tra mẫu khác 0.",
      "- `Fraction reduce()` rút gọn phân số, chuẩn hóa dấu âm nằm ở tử số, và trả về chính đối tượng hiện tại.",
      "- `Fraction add(Fraction other)`, `subtract`, `multiply`, `divide` trả về phân số mới đã rút gọn.",
      "- Override `equals(Object obj)` để hai phân số bằng nhau nếu giá trị sau rút gọn bằng nhau.",
      "- `toString()` trả về `numerator/denominator`; nếu mẫu là 1 thì chỉ trả về tử số.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["classes", "encapsulation", "equals"],
    starterCode: javaStarterFiles([
      {
        name: "Fraction.java",
        content: [
          "public class Fraction {",
          "    private int numerator;",
          "    private int denominator;",
          "",
          "    public Fraction(int numerator, int denominator) {",
          "        // TODO",
          "    }",
          "",
          "    public int getNumerator() { return numerator; }",
          "    public void setNumerator(int numerator) { this.numerator = numerator; }",
          "    public int getDenominator() { return denominator; }",
          "    public void setDenominator(int denominator) {",
          "        // TODO",
          "    }",
          "",
          "    public Fraction reduce() {",
          "        // TODO",
          "        return this;",
          "    }",
          "",
          "    public Fraction add(Fraction other) { return null; }",
          "    public Fraction subtract(Fraction other) { return null; }",
          "    public Fraction multiply(Fraction other) { return null; }",
          "    public Fraction divide(Fraction other) { return null; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "FractionTest.java",
        `
import net.bqc.oasis.junit.JavaReflection;
import org.junit.Assert;
import org.junit.Test;

public class FractionTest {
    @Test
    public void fieldsArePrivateIntegers() {
        Assert.assertTrue(JavaReflection.checkField(Fraction.class, "numerator", "int", "private"));
        Assert.assertTrue(JavaReflection.checkField(Fraction.class, "denominator", "int", "private"));
    }

    @Test
    public void reduceAndNormalizeSign() {
        Assert.assertEquals("1/2", new Fraction(2, 4).reduce().toString());
        Assert.assertEquals("-1/3", new Fraction(3, -9).reduce().toString());
        Assert.assertEquals("0", new Fraction(0, -5).reduce().toString());
    }

    @Test
    public void arithmeticWorks() {
        Assert.assertEquals("5/6", new Fraction(1, 2).add(new Fraction(1, 3)).toString());
        Assert.assertEquals("1/6", new Fraction(1, 2).subtract(new Fraction(1, 3)).toString());
        Assert.assertEquals("1/6", new Fraction(1, 2).multiply(new Fraction(1, 3)).toString());
        Assert.assertEquals("3/2", new Fraction(1, 2).divide(new Fraction(1, 3)).toString());
    }

    @Test
    public void equalsAndInvalidDenominator() {
        Assert.assertEquals(new Fraction(1, 2), new Fraction(2, 4));
        try {
            new Fraction(1, 0);
            Assert.fail("Expected ArithmeticException");
        } catch (ArithmeticException ex) {
            Assert.assertEquals("Denominator is zero", ex.getMessage());
        }
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 3 - Static, mảng và BMI",
    description: [
      "# Tuần 3. Static, mảng, JUnit",
      "",
      "Tương ứng slide `3.2_HieuThem_Java-2.pdf`; bài được xếp vào module 3 theo timeline 10 tuần.",
      "",
      "Cài đặt lớp `Week4` với các phương thức `public static`:",
      "- `int max2Int(int a, int b)` trả về số lớn hơn.",
      "- `int minArray(int[] arr)` trả về giá trị nhỏ nhất trong mảng. Nếu mảng rỗng hoặc `null`, ném `IllegalArgumentException`.",
      "- `String calculateBMI(double weight, double height)` tính BMI, làm tròn 1 chữ số thập phân, rồi trả về: `Thiếu cân`, `Bình thường`, `Thừa cân`, hoặc `Béo phì`.",
      "",
      "Ngưỡng BMI: dưới 18.5 là thiếu cân; 18.5 đến 22.9 bình thường; 23 đến 24.9 thừa cân; từ 25 béo phì.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["static-methods", "arrays", "junit"],
    starterCode: javaStarterFiles([
      {
        name: "Week4.java",
        content: [
          "public class Week4 {",
          "    public static int max2Int(int a, int b) { return 0; }",
          "    public static int minArray(int[] arr) { return 0; }",
          "    public static String calculateBMI(double weight, double height) { return \"\"; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "Week4Test.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class Week4Test {
    @Test
    public void maxAndMinWork() {
        Assert.assertEquals(8, Week4.max2Int(8, 3));
        Assert.assertEquals(-1, Week4.max2Int(-5, -1));
        Assert.assertEquals(-10, Week4.minArray(new int[] {3, 5, -10, 4}));
        Assert.assertEquals(7, Week4.minArray(new int[] {7}));
    }

    @Test
    public void bmiCategoriesWork() {
        Assert.assertEquals("Thiếu cân", Week4.calculateBMI(45, 1.70));
        Assert.assertEquals("Bình thường", Week4.calculateBMI(60, 1.65));
        Assert.assertEquals("Thừa cân", Week4.calculateBMI(68, 1.68));
        Assert.assertEquals("Béo phì", Week4.calculateBMI(82, 1.70));
    }

    @Test(expected = IllegalArgumentException.class)
    public void emptyArrayThrowsException() {
        Week4.minArray(new int[] {});
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 4 - Circle và Cylinder",
    description: [
      "# Tuần 4. Kế thừa, constructor, overriding",
      "",
      "Tương ứng slide `4-OOP_ThuaKe.pdf` và bài Circle/Cylinder trong tài liệu thực hành.",
      "",
      "Cài đặt hai lớp:",
      "",
      "## `Circle`",
      "- Thuộc tính `protected double radius`, `protected String color`.",
      "- Constructor mặc định: `radius = 1.0`, `color = \"red\"`.",
      "- Constructor `Circle(double radius)` và `Circle(double radius, String color)`.",
      "- Getter/setter cho `radius`, `color`.",
      "- `double getArea()` trả về diện tích hình tròn.",
      "- `toString()` trả về `Circle[radius=<radius>,color=<color>]`.",
      "",
      "## `Cylinder extends Circle`",
      "- Thuộc tính `private double height`.",
      "- Constructor mặc định: `radius = 1.0`, `height = 1.0`, `color = \"red\"`.",
      "- Constructor `Cylinder(double radius, double height)`.",
      "- Constructor `Cylinder(double radius, double height, String color)`.",
      "- `double getVolume()` trả về thể tích.",
      "- Override `getArea()` để trả về diện tích toàn phần.",
      "- `toString()` trả về `Cylinder[height=<height>,base=<Circle.toString()>]`.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["inheritance", "constructor", "overriding"],
    starterCode: javaStarterFiles([
      {
        name: "Circle.java",
        content: [
          "public class Circle {",
          "    protected double radius;",
          "    protected String color;",
          "",
          "    public Circle() { }",
          "    public Circle(double radius) { }",
          "    public Circle(double radius, String color) { }",
          "",
          "    public double getRadius() { return radius; }",
          "    public void setRadius(double radius) { this.radius = radius; }",
          "    public String getColor() { return color; }",
          "    public void setColor(String color) { this.color = color; }",
          "    public double getArea() { return 0; }",
          "}",
        ].join("\n"),
      },
      {
        name: "Cylinder.java",
        content: [
          "public class Cylinder extends Circle {",
          "    private double height;",
          "",
          "    public Cylinder() { }",
          "    public Cylinder(double radius, double height) { }",
          "    public Cylinder(double radius, double height, String color) { }",
          "",
          "    public double getHeight() { return height; }",
          "    public void setHeight(double height) { this.height = height; }",
          "    public double getVolume() { return 0; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "CircleCylinderTest.java",
        `
import net.bqc.oasis.junit.JavaReflection;
import org.junit.Assert;
import org.junit.Test;

public class CircleCylinderTest {
    @Test
    public void classStructureIsCorrect() {
        Assert.assertTrue(JavaReflection.checkField(Circle.class, "radius", "double", "protected"));
        Assert.assertTrue(JavaReflection.checkField(Circle.class, "color", "String|java.lang.String", "protected"));
        Assert.assertTrue(JavaReflection.checkField(Cylinder.class, "height", "double", "private"));
        Assert.assertEquals(Circle.class, Cylinder.class.getSuperclass());
    }

    @Test
    public void circleAreaAndStringWork() {
        Circle c = new Circle(2.0, "blue");
        Assert.assertEquals(4.0 * Math.PI, c.getArea(), 0.0001);
        Assert.assertEquals("Circle[radius=2.0,color=blue]", c.toString());
    }

    @Test
    public void cylinderVolumeAreaAndStringWork() {
        Cylinder cy = new Cylinder(2.0, 3.0, "green");
        Assert.assertEquals(12.0 * Math.PI, cy.getVolume(), 0.0001);
        Assert.assertEquals(20.0 * Math.PI, cy.getArea(), 0.0001);
        Assert.assertEquals("Cylinder[height=3.0,base=Circle[radius=2.0,color=green]]", cy.toString());
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 5 - Biểu thức đại số",
    description: [
      "# Tuần 5. Đa hình, abstract, exception",
      "",
      "Bám theo slide `5-OOP_Dahinh.pdf`, `6 - Exceptions.pdf` và bài biểu thức trong tài liệu thực hành; bài được xếp vào module 5 theo timeline 10 tuần.",
      "",
      "Cài đặt mô hình biểu thức:",
      "- `abstract class Expression` có `abstract int evaluate()`.",
      "- `Numeral extends Expression` lưu một số nguyên.",
      "- `Square extends Expression` bình phương giá trị biểu thức con.",
      "- `BinaryExpression extends Expression` là lớp trừu tượng có `left`, `right`.",
      "- `Addition`, `Subtraction`, `Multiplication`, `Division` kế thừa `BinaryExpression`.",
      "- `Division.evaluate()` ném `ArithmeticException` với thông điệp `Lỗi chia cho 0` nếu mẫu bằng 0.",
      "- `toString()` phải thể hiện biểu thức có ngoặc, ví dụ `((10 + -3) * 4)`.",
      "",
      "Bài này kiểm tra abstraction, kế thừa, ghi đè phương thức và xử lý ngoại lệ trong cây đối tượng.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["polymorphism", "abstraction", "exception-handling"],
    starterCode: javaStarterFiles([
      {
        name: "Expression.java",
        content: [
          "public abstract class Expression {",
          "    public abstract int evaluate();",
          "}",
          "",
          "class Numeral extends Expression {",
          "    // TODO",
          "    public int evaluate() { return 0; }",
          "}",
          "",
          "class Square extends Expression {",
          "    // TODO",
          "    public int evaluate() { return 0; }",
          "}",
          "",
          "abstract class BinaryExpression extends Expression {",
          "    protected Expression left;",
          "    protected Expression right;",
          "}",
          "",
          "class Addition extends BinaryExpression {",
          "    // TODO",
          "    public int evaluate() { return 0; }",
          "}",
          "",
          "class Subtraction extends BinaryExpression { public int evaluate() { return 0; } }",
          "class Multiplication extends BinaryExpression { public int evaluate() { return 0; } }",
          "class Division extends BinaryExpression { public int evaluate() { return 0; } }",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "ExpressionTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.lang.reflect.Modifier;

public class ExpressionTest {
    @Test
    public void classesAreAbstractWhereNeeded() {
        Assert.assertTrue(Modifier.isAbstract(Expression.class.getModifiers()));
        Assert.assertTrue(Modifier.isAbstract(BinaryExpression.class.getModifiers()));
    }

    @Test
    public void expressionTreeEvaluatesCorrectly() {
        Expression exp = new Square(
            new Addition(
                new Addition(new Square(new Numeral(10)), new Numeral(-3)),
                new Multiplication(new Numeral(4), new Numeral(3))
            )
        );
        Assert.assertEquals(11881, exp.evaluate());
    }

    @Test
    public void operationsAndDivisionByZeroWork() {
        Assert.assertEquals(7, new Subtraction(new Numeral(10), new Numeral(3)).evaluate());
        Assert.assertEquals(5, new Division(new Numeral(10), new Numeral(2)).evaluate());
        try {
            new Division(new Numeral(10), new Numeral(0)).evaluate();
            Assert.fail("Expected ArithmeticException");
        } catch (ArithmeticException ex) {
            Assert.assertEquals("Lỗi chia cho 0", ex.getMessage());
        }
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 5 - Sơ đồ hình học, Layer và Diagram",
    description: [
      "# Tuần 5. Đa hình, interface, quản lý danh sách đối tượng",
      "",
      "Tương ứng slide `5-OOP_Dahinh.pdf` và bài Diagram/Layer trong tài liệu thực hành.",
      "",
      "Cài đặt:",
      "- `interface Drawable` có `String draw()`.",
      "- `abstract class Shape implements Drawable` có tọa độ `x`, `y`, phương thức `boolean samePosition(Shape other)`.",
      "- Các lớp `Circle`, `Square`, `Triangle` kế thừa `Shape`.",
      "- `Layer` chứa danh sách `Shape`, có thuộc tính `visible`, `addShape`, `removeTriangles`, `removeDuplicates`, `draw()`.",
      "- `Diagram` chứa danh sách `Layer`, có `addLayer`, `removeCircles`, `moveShapesToDedicatedLayers`, `draw()`.",
      "",
      "Hai hình trùng nhau nếu cùng lớp, cùng tọa độ và cùng kích thước đặc trưng. `draw()` chỉ vẽ layer đang visible.",
    ].join("\n"),
    difficulty: "hard",
    oopTags: ["polymorphism", "interfaces", "collections"],
    starterCode: javaStarterFiles([
      {
        name: "Diagram.java",
        content: [
          "import java.util.*;",
          "",
          "interface Drawable {",
          "    String draw();",
          "}",
          "",
          "abstract class Shape implements Drawable {",
          "    protected int x;",
          "    protected int y;",
          "}",
          "",
          "class Circle extends Shape { }",
          "class Square extends Shape { }",
          "class Triangle extends Shape { }",
          "",
          "class Layer implements Drawable {",
          "    private boolean visible = true;",
          "    private List<Shape> shapes = new ArrayList<>();",
          "}",
          "",
          "public class Diagram implements Drawable {",
          "    private List<Layer> layers = new ArrayList<>();",
          "    public String draw() { return \"\"; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "DiagramTest.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class DiagramTest {
    @Test
    public void layerOperationsWork() {
        Layer layer = new Layer();
        layer.addShape(new Circle(0, 0, 5));
        layer.addShape(new Circle(0, 0, 5));
        layer.addShape(new Square(1, 1, 3));
        layer.addShape(new Triangle(2, 2, 4));
        layer.removeTriangles();
        layer.removeDuplicates();
        Assert.assertEquals("Circle(0,0,5)\\nSquare(1,1,3)", layer.draw().trim());
    }

    @Test
    public void invisibleLayerIsNotDrawn() {
        Layer layer = new Layer();
        layer.addShape(new Circle(0, 0, 5));
        layer.setVisible(false);
        Assert.assertEquals("", layer.draw());
    }

    @Test
    public void diagramRemovesCirclesAndDrawsVisibleLayers() {
        Layer l1 = new Layer();
        l1.addShape(new Circle(0, 0, 5));
        l1.addShape(new Square(1, 1, 3));
        Layer l2 = new Layer();
        l2.addShape(new Triangle(2, 2, 4));
        Diagram diagram = new Diagram();
        diagram.addLayer(l1);
        diagram.addLayer(l2);
        diagram.removeCircles();
        Assert.assertEquals("Square(1,1,3)\\nTriangle(2,2,4)", diagram.draw().trim());
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 6 - Xử lý ngoại lệ",
    description: [
      "# Tuần 6. try-catch, throw, custom exception",
      "",
      "Tương ứng slide `6 - Exceptions.pdf` và bảng bài tập ngoại lệ trong tài liệu thực hành.",
      "",
      "Cài đặt lớp `Week8_Task2` gồm 5 phương thức `public static String`:",
      "- `nullPointerEx()` bắt `NullPointerException` và trả về `Lỗi NullPointerException`.",
      "- `arrayIndexOutOfBoundsEx()` bắt `ArrayIndexOutOfBoundsException`.",
      "- `arithmeticEx()` bắt `ArithmeticException`.",
      "- `classCastEx()` bắt `ClassCastException`.",
      "- `fileNotFoundEx()` bắt `java.io.FileNotFoundException`.",
      "",
      "Nếu không có ngoại lệ, phương thức trả về `Không có lỗi`. Không để ngoại lệ thoát ra ngoài các phương thức trên.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["exception-handling"],
    starterCode: javaStarterFiles([
      {
        name: "Week8_Task2.java",
        content: [
          "public class Week8_Task2 {",
          "    public static String nullPointerEx() { return \"\"; }",
          "    public static String arrayIndexOutOfBoundsEx() { return \"\"; }",
          "    public static String arithmeticEx() { return \"\"; }",
          "    public static String classCastEx() { return \"\"; }",
          "    public static String fileNotFoundEx() { return \"\"; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "Week8Task2Test.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class Week8Task2Test {
    @Test
    public void methodsReturnExpectedMessages() {
        Assert.assertEquals("Lỗi NullPointerException", Week8_Task2.nullPointerEx());
        Assert.assertEquals("Lỗi ArrayIndexOutOfBoundsException", Week8_Task2.arrayIndexOutOfBoundsEx());
        Assert.assertEquals("Lỗi ArithmeticException", Week8_Task2.arithmeticEx());
        Assert.assertEquals("Lỗi ClassCastException", Week8_Task2.classCastEx());
        Assert.assertEquals("Lỗi FileNotFoundException", Week8_Task2.fileNotFoundEx());
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 7 - Utils đọc ghi tệp",
    description: [
      "# Tuần 7. I/O Streams và lớp `File`",
      "",
      "Tương ứng slide `7 - IOStreams.pdf` và bài `Utils` trong tài liệu thực hành.",
      "",
      "Cài đặt lớp `Utils` với các phương thức `public static`:",
      "- `String readContentFromFile(String path)` đọc toàn bộ nội dung file text UTF-8.",
      "- `void writeContentToFile(String path, String content)` ghi mới nội dung, xóa nội dung cũ nếu file đã tồn tại.",
      "- `void appendContentToFile(String path, String content)` ghi nối cuối file.",
      "- `File findFileByName(String folderPath, String fileName)` tìm file theo tên trong thư mục và các thư mục con; không thấy thì trả về `null`.",
      "",
      "Cần dùng API chuẩn của Java (`java.io`, `java.nio.file`) và đóng tài nguyên đúng cách.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["io-streams", "files", "static-methods"],
    starterCode: javaStarterFiles([
      {
        name: "Utils.java",
        content: [
          "import java.io.File;",
          "",
          "public class Utils {",
          "    public static String readContentFromFile(String path) { return \"\"; }",
          "    public static void writeContentToFile(String path, String content) { }",
          "    public static void appendContentToFile(String path, String content) { }",
          "    public static File findFileByName(String folderPath, String fileName) { return null; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "UtilsTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

public class UtilsTest {
    @Test
    public void readWriteAppendAndFindWork() throws Exception {
        Path dir = Files.createTempDirectory("oop-utils-test");
        Path file = dir.resolve("data.txt");
        Utils.writeContentToFile(file.toString(), "Hello");
        Assert.assertEquals("Hello", Utils.readContentFromFile(file.toString()));

        Utils.appendContentToFile(file.toString(), "\\nOOP");
        Assert.assertEquals("Hello\\nOOP", Utils.readContentFromFile(file.toString()));

        Files.createDirectories(dir.resolve("nested"));
        Path nested = dir.resolve("nested").resolve("target.txt");
        Files.writeString(nested, "target");
        File found = Utils.findFileByName(dir.toString(), "target.txt");
        Assert.assertNotNull(found);
        Assert.assertEquals("target.txt", found.getName());
        Assert.assertNull(Utils.findFileByName(dir.toString(), "missing.txt"));
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 9 - String, List và Map",
    description: [
      "# Tuần 9. Data structures: String, List, ArrayList, HashMap",
      "",
      "Tương ứng slide `9_Data structures.pdf`; bài được xếp vào module 9 theo timeline 10 tuần.",
      "",
      "Cài đặt lớp `TextAnalyzer`:",
      "- `List<String> normalizeWords(String text)`: tách từ theo khoảng trắng, bỏ dấu câu ở đầu/cuối, chuyển về chữ thường, bỏ token rỗng.",
      "- `Map<String, Integer> wordFrequency(String text)`: đếm số lần xuất hiện của từng từ, giữ thứ tự từ xuất hiện đầu tiên.",
      "- `String topWords(String text, int limit)`: trả về các cặp `word=count`, mỗi cặp một dòng, sắp xếp giảm dần theo số lần xuất hiện; nếu bằng nhau giữ thứ tự xuất hiện.",
      "",
      "Bài này kiểm tra cách dùng `String`, `List`, `ArrayList`, `Map`, `LinkedHashMap` và sắp xếp collection.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["strings", "collections", "map"],
    starterCode: javaStarterFiles([
      {
        name: "TextAnalyzer.java",
        content: [
          "import java.util.*;",
          "",
          "public class TextAnalyzer {",
          "    public static List<String> normalizeWords(String text) { return new ArrayList<>(); }",
          "    public static Map<String, Integer> wordFrequency(String text) { return new LinkedHashMap<>(); }",
          "    public static String topWords(String text, int limit) { return \"\"; }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "TextAnalyzerTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.util.*;

public class TextAnalyzerTest {
    @Test
    public void normalizeWordsWorks() {
        Assert.assertEquals(
            Arrays.asList("java", "oop", "java"),
            TextAnalyzer.normalizeWords(" Java,   OOP! java. ")
        );
    }

    @Test
    public void frequencyKeepsInsertionOrder() {
        Map<String, Integer> map = TextAnalyzer.wordFrequency("a b a c b a");
        Assert.assertEquals(Arrays.asList("a", "b", "c"), new ArrayList<>(map.keySet()));
        Assert.assertEquals(Integer.valueOf(3), map.get("a"));
        Assert.assertEquals(Integer.valueOf(2), map.get("b"));
        Assert.assertEquals(Integer.valueOf(1), map.get("c"));
    }

    @Test
    public void topWordsSortsByCount() {
        Assert.assertEquals("java=3\\noop=2", TextAnalyzer.topWords("java oop java design oop java", 2));
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 8 - Generic sort và Person",
    description: [
      "# Tuần 8. Lập trình tổng quát",
      "",
      "Tương ứng slide `8 - Generic.pdf` và bài Generic trong tài liệu thực hành.",
      "",
      "Cài đặt:",
      "- Lớp `Week11` có phương thức `public static <T extends Comparable<T>> List<T> sortGeneric(List<T> arr)`.",
      "- Tự cài đặt thuật toán sắp xếp, không gọi `Collections.sort`, `List.sort`, `Arrays.sort`.",
      "- Phương thức trả về một danh sách mới, không làm thay đổi danh sách đầu vào.",
      "- Lớp `Person implements Comparable<Person>` có `name`, `age`, `address`.",
      "- `Person` sắp xếp theo `name` tăng dần; nếu trùng tên thì theo `age` tăng dần.",
      "",
      "Bài này kiểm tra generic method, bounded type parameter, Comparable và tính bất biến dữ liệu đầu vào.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["generics", "comparable", "sorting"],
    starterCode: javaStarterFiles([
      {
        name: "Week11.java",
        content: [
          "import java.util.*;",
          "",
          "public class Week11 {",
          "    public static <T extends Comparable<T>> List<T> sortGeneric(List<T> arr) {",
          "        return new ArrayList<>();",
          "    }",
          "}",
          "",
          "class Person implements Comparable<Person> {",
          "    private String name;",
          "    private int age;",
          "    private String address;",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "Week11Test.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.util.*;

public class Week11Test {
    @Test
    public void sortPrimitiveWrappersAndStrings() {
        List<Integer> input = new ArrayList<>(Arrays.asList(5, -1, 3, 3, 0));
        Assert.assertEquals(Arrays.asList(-1, 0, 3, 3, 5), Week11.sortGeneric(input));
        Assert.assertEquals(Arrays.asList(5, -1, 3, 3, 0), input);
        Assert.assertEquals(Arrays.asList("An", "Binh", "Cuong"), Week11.sortGeneric(Arrays.asList("Cuong", "An", "Binh")));
    }

    @Test
    public void sortPersonByNameThenAge() {
        List<Person> people = Arrays.asList(
            new Person("Nguyen A", 22, "HN"),
            new Person("Nguyen A", 20, "HCM"),
            new Person("Le B", 21, "DN")
        );
        List<Person> sorted = Week11.sortGeneric(people);
        Assert.assertEquals("Le B-21-DN", sorted.get(0).toString());
        Assert.assertEquals("Nguyen A-20-HCM", sorted.get(1).toString());
        Assert.assertEquals("Nguyen A-22-HN", sorted.get(2).toString());
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 10 - Phả hệ với Composite",
    description: [
      "# Tuần 10. Design Pattern: Composite",
      "",
      "Tương ứng slide `10.1-Design Patterns 1.pdf` và bài phả hệ trong tài liệu thực hành.",
      "",
      "Cài đặt mô hình phả hệ:",
      "- `PersonNode` lưu `name`, `birthYear`, `gender`, `spouse`, danh sách con.",
      "- `void marry(PersonNode other)` thiết lập quan hệ vợ/chồng hai chiều.",
      "- `void addChild(PersonNode child)` thêm con.",
      "- Lớp `Genealogy` có các phương thức `public static`:",
      "  - `List<PersonNode> findUnmarried(PersonNode root)`.",
      "  - `List<String> findCouplesWithTwoChildren(PersonNode root)` trả về `A-B`.",
      "  - `List<PersonNode> findLatestGeneration(PersonNode root)` trả về các cá nhân không có con.",
      "",
      "Cần duyệt cây không lặp vô hạn qua quan hệ vợ/chồng và giữ thứ tự duyệt từ gốc xuống.",
    ].join("\n"),
    difficulty: "hard",
    oopTags: ["design-patterns", "composite", "tree"],
    starterCode: javaStarterFiles([
      {
        name: "Genealogy.java",
        content: [
          "import java.util.*;",
          "",
          "class PersonNode {",
          "    // TODO: fields, constructor, marry, addChild, getters",
          "}",
          "",
          "public class Genealogy {",
          "    public static List<PersonNode> findUnmarried(PersonNode root) { return new ArrayList<>(); }",
          "    public static List<String> findCouplesWithTwoChildren(PersonNode root) { return new ArrayList<>(); }",
          "    public static List<PersonNode> findLatestGeneration(PersonNode root) { return new ArrayList<>(); }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "GenealogyTest.java",
        `
import org.junit.Assert;
import org.junit.Test;
import java.util.*;
import java.util.stream.Collectors;

public class GenealogyTest {
    private PersonNode buildTree() {
        PersonNode james = new PersonNode("James", 1940, "M");
        PersonNode hana = new PersonNode("Hana", 1942, "F");
        PersonNode ryan = new PersonNode("Ryan", 1965, "M");
        PersonNode kai = new PersonNode("Kai", 1968, "M");
        PersonNode jennifer = new PersonNode("Jennifer", 1970, "F");
        PersonNode anna = new PersonNode("Anna", 1995, "F");
        PersonNode ben = new PersonNode("Ben", 1998, "M");
        PersonNode chris = new PersonNode("Chris", 2000, "M");
        PersonNode dana = new PersonNode("Dana", 2002, "F");
        james.marry(hana);
        james.addChild(ryan);
        james.addChild(kai);
        kai.marry(jennifer);
        kai.addChild(anna);
        kai.addChild(ben);
        kai.addChild(chris);
        kai.addChild(dana);
        return james;
    }

    @Test
    public void queriesWork() {
        PersonNode root = buildTree();
        Assert.assertEquals(Arrays.asList("Ryan", "Anna", "Ben", "Chris", "Dana"),
            Genealogy.findUnmarried(root).stream().map(PersonNode::getName).collect(Collectors.toList()));
        Assert.assertEquals(Arrays.asList("James-Hana"),
            Genealogy.findCouplesWithTwoChildren(root));
        Assert.assertEquals(Arrays.asList("Ryan", "Anna", "Ben", "Chris", "Dana"),
            Genealogy.findLatestGeneration(root).stream().map(PersonNode::getName).collect(Collectors.toList()));
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 10 - Sắp xếp với Strategy",
    description: [
      "# Tuần 10. Design Pattern: Strategy",
      "",
      "Tương ứng slide `10.1-Design Patterns 1.pdf` và câu Strategy trong tài liệu thực hành.",
      "",
      "Cài đặt:",
      "- `interface SortStrategy` có `int[] sort(int[] data, boolean ascending)`.",
      "- `BubbleSortStrategy` và `SelectionSortStrategy` cài đặt thuật toán tương ứng.",
      "- `Sorter` nhận `SortStrategy` qua constructor, có `setStrategy` và `sort`.",
      "- Không thay đổi mảng đầu vào; luôn trả về mảng mới.",
      "",
      "Bài này kiểm tra khả năng tách thuật toán khỏi ngữ cảnh sử dụng để có thể thay đổi thuật toán về sau.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["design-patterns", "strategy", "sorting"],
    starterCode: javaStarterFiles([
      {
        name: "Sorter.java",
        content: [
          "interface SortStrategy {",
          "    int[] sort(int[] data, boolean ascending);",
          "}",
          "",
          "class BubbleSortStrategy implements SortStrategy {",
          "    public int[] sort(int[] data, boolean ascending) { return data; }",
          "}",
          "",
          "class SelectionSortStrategy implements SortStrategy {",
          "    public int[] sort(int[] data, boolean ascending) { return data; }",
          "}",
          "",
          "public class Sorter {",
          "    private SortStrategy strategy;",
          "    public Sorter(SortStrategy strategy) { this.strategy = strategy; }",
          "    public void setStrategy(SortStrategy strategy) { this.strategy = strategy; }",
          "    public int[] sort(int[] data, boolean ascending) { return strategy.sort(data, ascending); }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "SorterTest.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class SorterTest {
    @Test
    public void strategiesSortBothDirectionsWithoutMutatingInput() {
        int[] original = {5, 1, 4, 2, 8};
        Sorter sorter = new Sorter(new BubbleSortStrategy());
        Assert.assertArrayEquals(new int[] {1, 2, 4, 5, 8}, sorter.sort(original, true));
        Assert.assertArrayEquals(new int[] {5, 1, 4, 2, 8}, original);

        sorter.setStrategy(new SelectionSortStrategy());
        Assert.assertArrayEquals(new int[] {8, 5, 4, 2, 1}, sorter.sort(original, false));
        Assert.assertArrayEquals(new int[] {5, 1, 4, 2, 8}, original);
    }
}
        `,
        100
      ),
    ],
  },
  {
    title: "Tuần 10 - Adapter cho thư viện sắp xếp",
    description: [
      "# Tuần 10. Design Pattern: Adapter",
      "",
      "Tương ứng slide `10.2-Design Patterns 2 (2023).pdf`: dùng Adapter khi framework yêu cầu một interface nhưng thư viện sẵn có lại có API khác.",
      "",
      "Cài đặt:",
      "- `interface IMath` có `int[] sort(int[] arr)`.",
      "- `MyMathLib` có sẵn phương thức `int[] quickSort(int[] arr)`.",
      "- `MathLibAdapter implements IMath`, bọc `MyMathLib` để client chỉ gọi `sort`.",
      "- `Client.sortNumbers(IMath math, int[] arr)` gọi qua interface, không phụ thuộc trực tiếp vào `MyMathLib`.",
      "- Không làm thay đổi mảng đầu vào.",
    ].join("\n"),
    difficulty: "medium",
    oopTags: ["design-patterns", "adapter", "interfaces"],
    starterCode: javaStarterFiles([
      {
        name: "Client.java",
        content: [
          "interface IMath {",
          "    int[] sort(int[] arr);",
          "}",
          "",
          "class MyMathLib {",
          "    public int[] quickSort(int[] arr) {",
          "        // Gia lap thu vien co san.",
          "        return arr;",
          "    }",
          "}",
          "",
          "class MathLibAdapter implements IMath {",
          "    // TODO",
          "    public int[] sort(int[] arr) { return arr; }",
          "}",
          "",
          "public class Client {",
          "    public static int[] sortNumbers(IMath math, int[] arr) {",
          "        return math.sort(arr);",
          "    }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      javaTestCase(
        "AdapterTest.java",
        `
import org.junit.Assert;
import org.junit.Test;

public class AdapterTest {
    @Test
    public void adapterLetsClientUseExistingLibraryThroughInterface() {
        int[] input = {9, 1, 5, 3};
        IMath math = new MathLibAdapter(new MyMathLib());
        Assert.assertArrayEquals(new int[] {1, 3, 5, 9}, Client.sortNumbers(math, input));
        Assert.assertArrayEquals(new int[] {9, 1, 5, 3}, input);
    }
}
        `,
        100
      ),
    ],
  },
];

async function replaceExerciseLibrary() {
  const oldLibraryExercises = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.isLibrary, 1));

  if (oldLibraryExercises.length === 0) {
    return;
  }

  const oldIds = oldLibraryExercises.map((exercise) => exercise.id);
  const oldSubmissions = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(inArray(submissions.exerciseId, oldIds));
  const oldSubmissionIds = oldSubmissions.map((submission) => submission.id);
  const oldProjectGroups = await db
    .select({ id: projectGroups.id })
    .from(projectGroups)
    .where(inArray(projectGroups.exerciseId, oldIds));
  const oldProjectGroupIds = oldProjectGroups.map((group) => group.id);

  if (oldSubmissionIds.length > 0) {
    await db.delete(submissionResults).where(inArray(submissionResults.submissionId, oldSubmissionIds));
  }
  if (oldProjectGroupIds.length > 0) {
    await db.delete(projectGroupMembers).where(inArray(projectGroupMembers.groupId, oldProjectGroupIds));
  }

  await db.delete(anticheatEvents).where(inArray(anticheatEvents.exerciseId, oldIds));
  await db.delete(projectGroups).where(inArray(projectGroups.exerciseId, oldIds));
  await db.delete(submissions).where(inArray(submissions.exerciseId, oldIds));
  await db.delete(exerciseAssignments).where(inArray(exerciseAssignments.exerciseId, oldIds));
  await db.delete(testCases).where(inArray(testCases.exerciseId, oldIds));
  await db.delete(exercises).where(eq(exercises.isLibrary, 1));
}

async function seedExercises() {
  console.log("Seeding OOP practice exercise library...");

  await replaceExerciseLibrary();

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
      await db
        .insert(exerciseAssignments)
        .values({
          id: crypto.randomUUID(),
          exerciseId: exercise.id,
          sectionId: section.id,
          deadline: null,
          isAssessment: isDefaultAssessment(exercise.title),
          isVisible: 1,
          allowSubmission: 1,
          maxSubmissions: null,
          week: weekFromTitle(exercise.title),
          assignedAt: now,
        })
        .onConflictDoUpdate({
          target: [exerciseAssignments.exerciseId, exerciseAssignments.sectionId],
          set: {
            deadline: null,
            isAssessment: isDefaultAssessment(exercise.title),
            isVisible: 1,
            allowSubmission: 1,
            maxSubmissions: null,
            week: weekFromTitle(exercise.title),
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
