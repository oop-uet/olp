import "dotenv/config";
import { db } from "./index.js";
import { exercises, testCases } from "./schema.js";
import crypto from "node:crypto";

interface ExerciseSeed {
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  oopTags: string[];
  starterCode: string;
  testCasesData: { inputData: string; expectedOutput: string; isVisible: number; pointValue: number }[];
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

const exerciseSeeds: ExerciseSeed[] = [
  // ─── Topic 1: Classes and Objects ──────────────────────────────────────────
  {
    title: "Quản lý sinh viên",
    description: [
      "# Bài 1. Quản lý sinh viên",
      "",
      "Thiết kế hai lớp `Student` và `StudentManagement` tương tự bài thực hành OOP gốc.",
      "",
      "## Lớp Student",
      "- Có 4 thuộc tính private: `name`, `id`, `group`, `email` đều có kiểu `String`.",
      "- Constructor mặc định tạo sinh viên: `Student - 000 - K62CB - uet@vnu.edu.vn`.",
      "- Constructor `Student(String name, String id, String email)` gán `group` mặc định là `K62CB`.",
      "- Constructor sao chép `Student(Student s)` sao chép đầy đủ thông tin.",
      "- Có getter/setter cho cả 4 thuộc tính.",
      "- `getInfo()` trả về đúng định dạng: `<name> - <id> - <group> - <email>`.",
      "",
      "## Lớp StudentManagement",
      "- Có trường mảng `students` kiểu `Student[]`, kích thước từ 4 đến 100 phần tử.",
      "- `sameGroup(Student s1, Student s2)` trả về `true` nếu hai sinh viên cùng lớp.",
      "- `addStudent(Student newStudent)` thêm sinh viên vào danh sách.",
      "- `studentsByGroup()` trả về danh sách sinh viên theo từng nhóm, giữ thứ tự nhóm theo lần xuất hiện đầu tiên.",
      "- `removeStudent(String id)` xóa sinh viên có mã sinh viên tương ứng.",
      "",
      "Bộ chấm ẩn sẽ kiểm tra bằng reflection tương tự `MyTest.java`, nên tên lớp, tên trường, tên phương thức và kiểu trả về phải khớp chính xác.",
    ].join("\n"),
    difficulty: "easy",
    oopTags: ["classes", "objects"],
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
          "",
          "    public String getId() { return id; }",
          "    public void setId(String id) { this.id = id; }",
          "",
          "    public String getGroup() { return group; }",
          "    public void setGroup(String group) { this.group = group; }",
          "",
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
          "",
          "    public static void main(String[] args) {",
          "        StudentManagement sm = new StudentManagement();",
          "        Student s1 = new Student(\"Nguyen Van An\", \"17020001\", \"17020001@vnu.edu.vn\");",
          "        s1.setGroup(\"K62CC\");",
          "        Student s2 = new Student(\"Nguyen Van B\", \"17020002\", \"17020002@vnu.edu.vn\");",
          "        s2.setGroup(\"K62CC\");",
          "        Student s3 = new Student(\"Nguyen Van C\", \"17020003\", \"17020003@vnu.edu.vn\");",
          "        Student s4 = new Student(\"Nguyen Van D\", \"17020004\", \"17020004@vnu.edu.vn\");",
          "        sm.addStudent(s1);",
          "        sm.addStudent(s2);",
          "        sm.addStudent(s3);",
          "        sm.addStudent(s4);",
          "        System.out.print(sm.studentsByGroup());",
          "    }",
          "}",
        ].join("\n"),
      },
    ]),
    testCasesData: [
      {
        inputData: "",
        expectedOutput: "K62CC\nNguyen Van An - 17020001 - K62CC - 17020001@vnu.edu.vn\nNguyen Van B - 17020002 - K62CC - 17020002@vnu.edu.vn\nK62CB\nNguyen Van C - 17020003 - K62CB - 17020003@vnu.edu.vn\nNguyen Van D - 17020004 - K62CB - 17020004@vnu.edu.vn",
        isVisible: 1,
        pointValue: 40,
      },
      {
        inputData: "",
        expectedOutput: "K62CC\nNguyen Van An - 17020001 - K62CC - 17020001@vnu.edu.vn\nNguyen Van B - 17020002 - K62CC - 17020002@vnu.edu.vn\nK62CB\nNguyen Van C - 17020003 - K62CB - 17020003@vnu.edu.vn\nNguyen Van D - 17020004 - K62CB - 17020004@vnu.edu.vn",
        isVisible: 0,
        pointValue: 60,
      },
    ],
  },
  {
    title: "Bank Account Operations",
    description:
      "Create a `BankAccount` class with private fields: `accountNumber` (String), `ownerName` (String), and `balance` (double). " +
      "Implement methods: `deposit(double amount)` adds to balance (amount must be positive), " +
      "`withdraw(double amount)` subtracts from balance (amount must be positive and <= balance), " +
      "and `getBalance()` returns current balance. Throw IllegalArgumentException for invalid operations. " +
      "Read operations from stdin: each line is `deposit <amount>` or `withdraw <amount>`. Print final balance.",
    difficulty: "easy",
    oopTags: ["classes", "objects"],
    starterCode: [
      "import java.util.Scanner;",
      "",
      "public class BankAccount {",
      "    // TODO: Declare private fields",
      "",
      "    // TODO: Implement constructor, deposit, withdraw, getBalance",
      "",
      "    public static void main(String[] args) {",
      "        Scanner sc = new Scanner(System.in);",
      "        // TODO: Read account info and process operations",
      "    }",
      "}",
    ].join("\n"),
    testCasesData: [
      { inputData: "ACC001 Alice 1000.0\ndeposit 500.0\nwithdraw 200.0\nend", expectedOutput: "1300.0", isVisible: 1, pointValue: 30 },
      { inputData: "ACC002 Bob 0.0\ndeposit 100.0\ndeposit 200.0\nend", expectedOutput: "300.0", isVisible: 1, pointValue: 30 },
      { inputData: "ACC003 Charlie 500.0\nwithdraw 600.0\nend", expectedOutput: "IllegalArgumentException", isVisible: 0, pointValue: 20 },
      { inputData: "ACC004 Dave 100.0\ndeposit -50.0\nend", expectedOutput: "IllegalArgumentException", isVisible: 0, pointValue: 20 },
    ],
  },

  // ─── Topic 2: Inheritance ──────────────────────────────────────────────────
  {
    title: "Shape Hierarchy with Inheritance",
    description:
      "Create a class hierarchy: abstract class `Shape` with an abstract method `area()` returning double. " +
      "Create subclasses `Circle` (field: radius) and `Rectangle` (fields: width, height). " +
      "Each subclass implements `area()`. Also override `toString()` to return: " +
      "`Circle[radius=<r>]` or `Rectangle[width=<w>, height=<h>]`. " +
      "Read shape data from stdin, create objects, and print their area rounded to 2 decimal places.",
    difficulty: "medium",
    oopTags: ["inheritance", "classes"],
    starterCode: [
      "public abstract class Shape {",
      "    public abstract double area();",
      "}",
      "",
      "// TODO: Implement Circle extends Shape",
      "",
      "// TODO: Implement Rectangle extends Shape",
      "",
      "// Main class to read input and print areas",
    ].join("\n"),
    testCasesData: [
      { inputData: "circle 5.0", expectedOutput: "78.54", isVisible: 1, pointValue: 30 },
      { inputData: "rectangle 3.0 4.0", expectedOutput: "12.00", isVisible: 1, pointValue: 30 },
      { inputData: "circle 1.0", expectedOutput: "3.14", isVisible: 0, pointValue: 20 },
      { inputData: "rectangle 10.0 0.5", expectedOutput: "5.00", isVisible: 0, pointValue: 20 },
    ],
  },
  {
    title: "Employee Payroll System",
    description:
      "Create a base class `Employee` with fields: `name` (String) and `baseSalary` (double). " +
      "Create subclass `Manager` that adds a `bonus` (double) field. " +
      "Create subclass `Developer` that adds `overtimeHours` (int) with overtime rate of 200,000 VND/hour. " +
      "Each class has a `calculatePay()` method: Employee returns baseSalary, " +
      "Manager returns baseSalary + bonus, Developer returns baseSalary + overtimeHours * 200000. " +
      "Read employee data and print total pay.",
    difficulty: "medium",
    oopTags: ["inheritance"],
    starterCode: [
      "import java.util.Scanner;",
      "",
      "public class Employee {",
      "    protected String name;",
      "    protected double baseSalary;",
      "",
      "    // TODO: Constructor and calculatePay()",
      "}",
      "",
      "// TODO: class Manager extends Employee",
      "",
      "// TODO: class Developer extends Employee",
    ].join("\n"),
    testCasesData: [
      { inputData: "manager Alice 10000000 2000000", expectedOutput: "12000000.0", isVisible: 1, pointValue: 30 },
      { inputData: "developer Bob 8000000 10", expectedOutput: "10000000.0", isVisible: 1, pointValue: 30 },
      { inputData: "developer Charlie 15000000 0", expectedOutput: "15000000.0", isVisible: 0, pointValue: 20 },
      { inputData: "manager Dave 5000000 500000", expectedOutput: "5500000.0", isVisible: 0, pointValue: 20 },
    ],
  },

  // ─── Topic 3: Polymorphism ─────────────────────────────────────────────────
  {
    title: "Animal Sound Polymorphism",
    description:
      "Create a base class `Animal` with a method `makeSound()` that returns a String. " +
      "Create subclasses: `Dog` (returns \"Woof\"), `Cat` (returns \"Meow\"), `Duck` (returns \"Quack\"). " +
      "In the main method, read a list of animal types from stdin (one per line until 'end'), " +
      "create an array of Animal references, and print each animal's sound using polymorphism. " +
      "Print one sound per line.",
    difficulty: "easy",
    oopTags: ["polymorphism", "inheritance"],
    starterCode: [
      "import java.util.*;",
      "",
      "public class Animal {",
      "    public String makeSound() {",
      "        return \"\";",
      "    }",
      "",
      "    public static void main(String[] args) {",
      "        Scanner sc = new Scanner(System.in);",
      "        List<Animal> animals = new ArrayList<>();",
      "        // TODO: Read animal types and create objects",
      "        // TODO: Print sounds using polymorphism",
      "    }",
      "}",
      "",
      "// TODO: class Dog extends Animal",
      "// TODO: class Cat extends Animal",
      "// TODO: class Duck extends Animal",
    ].join("\n"),
    testCasesData: [
      { inputData: "dog\ncat\nduck\nend", expectedOutput: "Woof\nMeow\nQuack", isVisible: 1, pointValue: 30 },
      { inputData: "cat\ncat\ndog\nend", expectedOutput: "Meow\nMeow\nWoof", isVisible: 1, pointValue: 30 },
      { inputData: "duck\nend", expectedOutput: "Quack", isVisible: 0, pointValue: 20 },
      { inputData: "dog\ndog\ndog\nduck\ncat\nend", expectedOutput: "Woof\nWoof\nWoof\nQuack\nMeow", isVisible: 0, pointValue: 20 },
    ],
  },
  {
    title: "Payment Method Polymorphism",
    description:
      "Design a payment processing system using polymorphism. Create abstract class `Payment` with: " +
      "abstract method `processPayment(double amount)` returning a String description of the payment. " +
      "Implement `CreditCardPayment` (field: cardNumber last 4 digits), `BankTransferPayment` (field: bankName), " +
      "and `EWalletPayment` (field: walletProvider). " +
      "processPayment should return: " +
      "\"Paid <amount> via Credit Card ending in <last4>\", " +
      "\"Paid <amount> via Bank Transfer from <bankName>\", or " +
      "\"Paid <amount> via E-Wallet <provider>\". " +
      "Read payment type, details, and amount from stdin.",
    difficulty: "medium",
    oopTags: ["polymorphism", "abstraction"],
    starterCode: [
      "import java.util.Scanner;",
      "",
      "public abstract class Payment {",
      "    public abstract String processPayment(double amount);",
      "}",
      "",
      "// TODO: Implement CreditCardPayment",
      "// TODO: Implement BankTransferPayment",
      "// TODO: Implement EWalletPayment",
    ].join("\n"),
    testCasesData: [
      { inputData: "credit 1234 500000", expectedOutput: "Paid 500000.0 via Credit Card ending in 1234", isVisible: 1, pointValue: 30 },
      { inputData: "bank Vietcombank 1000000", expectedOutput: "Paid 1000000.0 via Bank Transfer from Vietcombank", isVisible: 1, pointValue: 30 },
      { inputData: "ewallet MoMo 50000", expectedOutput: "Paid 50000.0 via E-Wallet MoMo", isVisible: 0, pointValue: 20 },
      { inputData: "credit 5678 250000", expectedOutput: "Paid 250000.0 via Credit Card ending in 5678", isVisible: 0, pointValue: 20 },
    ],
  },

  // ─── Topic 4: Abstraction ──────────────────────────────────────────────────
  {
    title: "Vehicle Fleet Management",
    description:
      "Create an abstract class `Vehicle` with abstract methods: `fuelEfficiency()` returning km per liter (double), " +
      "and `maintenanceCost()` returning annual cost (double). Add concrete method `costPerKm()` = maintenanceCost() / (fuelEfficiency() * 365). " +
      "Implement `Car` (fuelEfficiency=12.0, maintenanceCost=5000000), " +
      "`Motorcycle` (fuelEfficiency=40.0, maintenanceCost=2000000), " +
      "and `Truck` (fuelEfficiency=5.0, maintenanceCost=15000000). " +
      "Read a vehicle type from stdin and print its costPerKm rounded to 2 decimal places.",
    difficulty: "medium",
    oopTags: ["abstraction", "inheritance"],
    starterCode: [
      "import java.util.Scanner;",
      "",
      "public abstract class Vehicle {",
      "    public abstract double fuelEfficiency();",
      "    public abstract double maintenanceCost();",
      "",
      "    public double costPerKm() {",
      "        // TODO: Implement using abstract methods",
      "        return 0;",
      "    }",
      "",
      "    public static void main(String[] args) {",
      "        // TODO: Read vehicle type and print costPerKm",
      "    }",
      "}",
    ].join("\n"),
    testCasesData: [
      { inputData: "car", expectedOutput: "1141.55", isVisible: 1, pointValue: 30 },
      { inputData: "motorcycle", expectedOutput: "136.99", isVisible: 1, pointValue: 30 },
      { inputData: "truck", expectedOutput: "8219.18", isVisible: 0, pointValue: 40 },
    ],
  },
  {
    title: "Database Connector Abstraction",
    description:
      "Design an abstract class `DatabaseConnector` with: abstract methods `connect()` returning a connection status String, " +
      "`disconnect()` returning a disconnection message, and `executeQuery(String query)` returning a result String. " +
      "Implement `MySQLConnector` (host, port) and `SQLiteConnector` (filePath). " +
      "connect() returns \"Connected to MySQL at <host>:<port>\" or \"Connected to SQLite database: <filePath>\". " +
      "disconnect() returns \"Disconnected from MySQL\" or \"Disconnected from SQLite\". " +
      "executeQuery returns \"MySQL executing: <query>\" or \"SQLite executing: <query>\". " +
      "Read connector type, config, and a query from stdin. Print connect, executeQuery, disconnect results.",
    difficulty: "hard",
    oopTags: ["abstraction"],
    starterCode: [
      "import java.util.Scanner;",
      "",
      "public abstract class DatabaseConnector {",
      "    public abstract String connect();",
      "    public abstract String disconnect();",
      "    public abstract String executeQuery(String query);",
      "}",
      "",
      "// TODO: Implement MySQLConnector",
      "// TODO: Implement SQLiteConnector",
    ].join("\n"),
    testCasesData: [
      { inputData: "mysql localhost 3306\nSELECT * FROM users", expectedOutput: "Connected to MySQL at localhost:3306\nMySQL executing: SELECT * FROM users\nDisconnected from MySQL", isVisible: 1, pointValue: 30 },
      { inputData: "sqlite /data/app.db\nINSERT INTO logs VALUES(1)", expectedOutput: "Connected to SQLite database: /data/app.db\nSQLite executing: INSERT INTO logs VALUES(1)\nDisconnected from SQLite", isVisible: 1, pointValue: 30 },
      { inputData: "mysql 192.168.1.1 5432\nDROP TABLE temp", expectedOutput: "Connected to MySQL at 192.168.1.1:5432\nMySQL executing: DROP TABLE temp\nDisconnected from MySQL", isVisible: 0, pointValue: 40 },
    ],
  },

  // ─── Topic 5: Encapsulation ────────────────────────────────────────────────
  {
    title: "Temperature Converter with Validation",
    description:
      "Create a `Temperature` class that encapsulates a temperature value in Celsius. " +
      "The class should have: a private field `celsius` (double), " +
      "a constructor that validates the value (must be >= -273.15, absolute zero), " +
      "getter `getCelsius()`, setter `setCelsius(double)` with validation, " +
      "`toFahrenheit()` returning celsius * 9/5 + 32, " +
      "and `toKelvin()` returning celsius + 273.15. " +
      "Throw IllegalArgumentException if temperature is below absolute zero. " +
      "Read a temperature and conversion type (F or K) from stdin. Print result rounded to 2 decimals.",
    difficulty: "easy",
    oopTags: ["encapsulation"],
    starterCode: [
      "import java.util.Scanner;",
      "",
      "public class Temperature {",
      "    // TODO: Private field",
      "",
      "    // TODO: Constructor with validation",
      "",
      "    // TODO: Getter and setter with validation",
      "",
      "    // TODO: toFahrenheit() and toKelvin()",
      "",
      "    public static void main(String[] args) {",
      "        Scanner sc = new Scanner(System.in);",
      "        // TODO: Read and convert",
      "    }",
      "}",
    ].join("\n"),
    testCasesData: [
      { inputData: "100.0 F", expectedOutput: "212.00", isVisible: 1, pointValue: 25 },
      { inputData: "0.0 K", expectedOutput: "273.15", isVisible: 1, pointValue: 25 },
      { inputData: "-40.0 F", expectedOutput: "-40.00", isVisible: 0, pointValue: 25 },
      { inputData: "-300.0 F", expectedOutput: "IllegalArgumentException", isVisible: 0, pointValue: 25 },
    ],
  },
  {
    title: "Library Book Management",
    description:
      "Create a `Book` class demonstrating encapsulation with: private fields `isbn` (String), `title` (String), " +
      "`author` (String), `totalCopies` (int), and `availableCopies` (int). " +
      "Provide getters for all fields. The setter for totalCopies must ensure totalCopies >= availableCopies. " +
      "Implement `borrowBook()` which decreases availableCopies by 1 (throws IllegalStateException if no copies available). " +
      "Implement `returnBook()` which increases availableCopies by 1 (throws IllegalStateException if availableCopies == totalCopies). " +
      "Read operations from stdin: `borrow` or `return`, then print availableCopies after all operations.",
    difficulty: "medium",
    oopTags: ["encapsulation", "classes"],
    starterCode: [
      "import java.util.Scanner;",
      "",
      "public class Book {",
      "    // TODO: Private fields",
      "",
      "    // TODO: Constructor",
      "",
      "    // TODO: Getters and validated setters",
      "",
      "    // TODO: borrowBook() and returnBook()",
      "",
      "    public static void main(String[] args) {",
      "        // TODO: Read book info and process operations",
      "    }",
      "}",
    ].join("\n"),
    testCasesData: [
      { inputData: "978-0 Java-OOP Author1 5 5\nborrow\nborrow\nend", expectedOutput: "3", isVisible: 1, pointValue: 30 },
      { inputData: "978-1 Design-Patterns Author2 3 1\nreturn\nreturn\nend", expectedOutput: "3", isVisible: 1, pointValue: 30 },
      { inputData: "978-2 Clean-Code Author3 2 0\nborrow\nend", expectedOutput: "IllegalStateException", isVisible: 0, pointValue: 20 },
      { inputData: "978-3 Algorithms Author4 3 3\nreturn\nend", expectedOutput: "IllegalStateException", isVisible: 0, pointValue: 20 },
    ],
  },

  // ─── Topic 6: Interfaces ───────────────────────────────────────────────────
  {
    title: "Sortable Interface Implementation",
    description:
      "Create an interface `Sortable` with method `int compareTo(Sortable other)`. " +
      "Implement a `Product` class with fields: `name` (String) and `price` (double) that implements Sortable. " +
      "compareTo compares by price: return negative if this.price < other.price, 0 if equal, positive if greater. " +
      "Read N products from stdin (name price per line), sort them by price ascending using your compareTo, " +
      "and print each product as `<name>: <price>` one per line.",
    difficulty: "medium",
    oopTags: ["interfaces"],
    starterCode: [
      "import java.util.*;",
      "",
      "interface Sortable {",
      "    int compareTo(Sortable other);",
      "}",
      "",
      "public class Product implements Sortable {",
      "    // TODO: fields, constructor, compareTo",
      "",
      "    public static void main(String[] args) {",
      "        Scanner sc = new Scanner(System.in);",
      "        // TODO: Read products, sort, and print",
      "    }",
      "}",
    ].join("\n"),
    testCasesData: [
      { inputData: "3\nApple 25000\nBanana 15000\nCherry 35000", expectedOutput: "Banana: 15000.0\nApple: 25000.0\nCherry: 35000.0", isVisible: 1, pointValue: 30 },
      { inputData: "2\nLaptop 20000000\nMouse 500000", expectedOutput: "Mouse: 500000.0\nLaptop: 20000000.0", isVisible: 1, pointValue: 30 },
      { inputData: "4\nD 100\nA 100\nC 50\nB 200", expectedOutput: "C: 50.0\nD: 100.0\nA: 100.0\nB: 200.0", isVisible: 0, pointValue: 40 },
    ],
  },
  {
    title: "Multiple Interface Implementation",
    description:
      "Create two interfaces: `Printable` with method `String print()` and `Exportable` with method `String export(String format)`. " +
      "Implement a `Report` class with fields: `title` (String), `content` (String), and `author` (String). " +
      "Report implements both interfaces. " +
      "`print()` returns \"Report: <title> by <author>\". " +
      "`export(\"json\")` returns `{\"title\":\"<title>\",\"author\":\"<author>\"}`. " +
      "`export(\"csv\")` returns `<title>,<author>,<content>`. " +
      "Read report data and export format from stdin.",
    difficulty: "medium",
    oopTags: ["interfaces"],
    starterCode: [
      "import java.util.Scanner;",
      "",
      "interface Printable {",
      "    String print();",
      "}",
      "",
      "interface Exportable {",
      "    String export(String format);",
      "}",
      "",
      "public class Report implements Printable, Exportable {",
      "    // TODO: fields, constructor, implement both interfaces",
      "",
      "    public static void main(String[] args) {",
      "        // TODO: Read data, create report, print and export",
      "    }",
      "}",
    ].join("\n"),
    testCasesData: [
      { inputData: "OOP-Report Introduction-to-OOP NguyenVanA\njson", expectedOutput: "Report: OOP-Report by NguyenVanA\n{\"title\":\"OOP-Report\",\"author\":\"NguyenVanA\"}", isVisible: 1, pointValue: 30 },
      { inputData: "Final-Report Summary-of-findings TranThiB\ncsv", expectedOutput: "Report: Final-Report by TranThiB\nFinal-Report,TranThiB,Summary-of-findings", isVisible: 1, pointValue: 35 },
      { inputData: "Test-Doc Content-here Admin\njson", expectedOutput: "Report: Test-Doc by Admin\n{\"title\":\"Test-Doc\",\"author\":\"Admin\"}", isVisible: 0, pointValue: 35 },
    ],
  },

  // ─── Topic 7: Exception Handling ───────────────────────────────────────────
  {
    title: "Custom Exception for Age Validation",
    description:
      "Create a custom exception class `InvalidAgeException` that extends Exception with a message field. " +
      "Create a `Person` class with fields: `name` (String) and `age` (int). " +
      "The constructor should throw `InvalidAgeException` if age < 0 or age > 150 with message " +
      "\"Invalid age: <age>. Age must be between 0 and 150.\". " +
      "In main, read name and age from stdin. Try to create a Person and print \"Person: <name>, age <age>\". " +
      "Catch InvalidAgeException and print the exception message.",
    difficulty: "easy",
    oopTags: ["exception-handling"],
    starterCode: [
      "import java.util.Scanner;",
      "",
      "class InvalidAgeException extends Exception {",
      "    // TODO: Constructor with message",
      "}",
      "",
      "public class Person {",
      "    // TODO: fields and constructor that validates age",
      "",
      "    public static void main(String[] args) {",
      "        Scanner sc = new Scanner(System.in);",
      "        // TODO: Read input, handle exceptions",
      "    }",
      "}",
    ].join("\n"),
    testCasesData: [
      { inputData: "Alice 25", expectedOutput: "Person: Alice, age 25", isVisible: 1, pointValue: 30 },
      { inputData: "Bob -5", expectedOutput: "Invalid age: -5. Age must be between 0 and 150.", isVisible: 1, pointValue: 30 },
      { inputData: "Charlie 200", expectedOutput: "Invalid age: 200. Age must be between 0 and 150.", isVisible: 0, pointValue: 20 },
      { inputData: "Dave 0", expectedOutput: "Person: Dave, age 0", isVisible: 0, pointValue: 20 },
    ],
  },
  {
    title: "File Processing with Exception Handling",
    description:
      "Create a `DataProcessor` class that processes numerical data with robust exception handling. " +
      "Implement method `processLine(String line)` that: " +
      "1) Splits the line by spaces, 2) Parses each token as an integer, 3) Returns the sum. " +
      "Handle `NumberFormatException` by skipping invalid tokens and counting errors. " +
      "Implement `processAll(String[] lines)` that processes each line and collects results. " +
      "If a line has ALL invalid tokens, throw a custom `EmptyResultException` with the line number. " +
      "Read lines from stdin until 'end'. Print sum for valid lines or \"Error at line <n>: <message>\" for errors.",
    difficulty: "hard",
    oopTags: ["exception-handling"],
    starterCode: [
      "import java.util.*;",
      "",
      "class EmptyResultException extends Exception {",
      "    // TODO: Include line number in message",
      "}",
      "",
      "public class DataProcessor {",
      "    // TODO: processLine and processAll methods",
      "",
      "    public static void main(String[] args) {",
      "        Scanner sc = new Scanner(System.in);",
      "        // TODO: Read lines, process, handle exceptions",
      "    }",
      "}",
    ].join("\n"),
    testCasesData: [
      { inputData: "1 2 3\n4 5 6\nend", expectedOutput: "6\n15", isVisible: 1, pointValue: 25 },
      { inputData: "10 abc 20\n5 5 5\nend", expectedOutput: "30\n15", isVisible: 1, pointValue: 25 },
      { inputData: "abc def ghi\nend", expectedOutput: "Error at line 1: no valid numbers", isVisible: 0, pointValue: 25 },
      { inputData: "1 2\nabc xyz\n3 4 5\nend", expectedOutput: "3\nError at line 2: no valid numbers\n12", isVisible: 0, pointValue: 25 },
    ],
  },
];


async function seedExercises() {
  console.log("🌱 Seeding Exercise Library...");

  const now = new Date().toISOString();
  let exerciseCount = 0;
  let testCaseCount = 0;

  for (const seed of exerciseSeeds) {
    const exerciseId = crypto.randomUUID();

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
      .onConflictDoNothing();

    exerciseCount++;

    for (const tc of seed.testCasesData) {
      const testCaseId = crypto.randomUUID();

      await db
        .insert(testCases)
        .values({
          id: testCaseId,
          exerciseId,
          inputData: tc.inputData,
          expectedOutput: tc.expectedOutput,
          isVisible: tc.isVisible,
          pointValue: tc.pointValue,
          timeLimitSeconds: 10,
          createdAt: now,
        })
        .onConflictDoNothing();

      testCaseCount++;
    }

    console.log(`  ✅ ${seed.title} (${seed.difficulty}) [${seed.oopTags.join(", ")}]`);
  }

  console.log(`\n🎉 Exercise Library seeded successfully!`);
  console.log(`   Total exercises: ${exerciseCount}`);
  console.log(`   Total test cases: ${testCaseCount}`);
  console.log(`   Topics covered: classes/objects, inheritance, polymorphism, abstraction, encapsulation, interfaces, exception handling`);
  process.exit(0);
}

seedExercises().catch((error) => {
  console.error("❌ Exercise seeding failed:", error);
  process.exit(1);
});
