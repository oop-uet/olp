import net.bqc.oasis.junit.JavaReflection;
import org.junit.Assert;
import org.junit.BeforeClass;
import org.junit.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
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
            setNameMethod = JavaReflection.getMethod(
                    Student.class, "setName", void.class, "", "", String.class);
            setIdMethod = JavaReflection.getMethod(
                    Student.class, "setId", void.class, "", "", String.class);
            setGroupMethod = JavaReflection.getMethod(
                    Student.class, "setGroup", void.class, "", "", String.class);
            setEmailMethod = JavaReflection.getMethod(
                    Student.class, "setEmail", void.class, "", "", String.class);
            getInfoMethod = JavaReflection.getMethod(
                    Student.class, "getInfo", String.class, "", "");
            getNameMethod = JavaReflection.getMethod(
                    Student.class, "getName", String.class, "", "");
            getEmailMethod = JavaReflection.getMethod(
                    Student.class, "getEmail", String.class, "", "");
            getIdMethod = JavaReflection.getMethod(
                    Student.class, "getId", String.class, "", "");
            getGroupMethod = JavaReflection.getMethod(
                    Student.class, "getGroup", String.class, "", "");

            sameGroupMethod = JavaReflection.getMethod(
                    StudentManagement.class, "sameGroup", boolean.class, "", "static", Student.class, Student.class);
            studentsByGroupMethod = JavaReflection.getMethod(
                    StudentManagement.class, "studentsByGroup", String.class, "", "");
            addStudentMethod = JavaReflection.getMethod(
                    StudentManagement.class, "addStudent", void.class, "", "", Student.class);
            removeStudentMethod = JavaReflection.getMethod(
                    StudentManagement.class, "removeStudent", void.class, "", "", String.class);
        }

        @Test
        public void test_1() {
            Assert.assertTrue(JavaReflection.checkField(
                    Student.class, "name", "String|java.lang.String", "private"));
            Assert.assertTrue(JavaReflection.checkField(
                    Student.class, "id", "String|java.lang.String", "private"));
            Assert.assertTrue(JavaReflection.checkField(
                    Student.class, "group", "String|java.lang.String", "private"));
            Assert.assertTrue(JavaReflection.checkField(
                    Student.class, "email", "String|java.lang.String", "private"));
        }

        @Test
        public void test_2() {
            try {
                Student s = new Student();

                Assert.assertNotNull(setNameMethod);
                Assert.assertNotNull(getNameMethod);

                setNameMethod.invoke(s, "Nguyen Van A");
                String name = (String) getNameMethod.invoke(s);
                Assert.assertEquals("Nguyen Van A", name);

                Assert.assertNotNull(setIdMethod);
                Assert.assertNotNull(getIdMethod);

                setIdMethod.invoke(s, "14020123");
                String id = (String) getIdMethod.invoke(s);
                Assert.assertEquals("14020123", id);

                Assert.assertNotNull(setGroupMethod);
                Assert.assertNotNull(getGroupMethod);

                setGroupMethod.invoke(s, "N1");
                String group = (String) getGroupMethod.invoke(s);
                Assert.assertEquals("N1", group);

                Assert.assertNotNull(setEmailMethod);
                Assert.assertNotNull(getEmailMethod);

                setEmailMethod.invoke(s, "14020123@vnu.edu.vn");
                String email = (String) getEmailMethod.invoke(s);
                Assert.assertEquals("14020123@vnu.edu.vn", email);
            } catch (Exception e) {
                Assert.fail("Exception when invoke method");
            }
        }

        @Test
        public void test_3() {
            try {
                Student s = new Student();

                setNameMethod.invoke(s, "Nguyen Van An");
                setIdMethod.invoke(s, "17020001");
                setGroupMethod.invoke(s, "K62CC");
                setEmailMethod.invoke(s, "17020001@vnu.edu.vn");
                String info = (String) getInfoMethod.invoke(s);
                Assert.assertEquals("Nguyen Van An - 17020001 - K62CC - 17020001@vnu.edu.vn", info.trim());
            } catch (Exception e) {
                Assert.fail("Exception when invoke method");
            }
        }

        @Test
        public void test_4() {
            try {
                Constructor defaultCons = Student.class.getDeclaredConstructor();
                Student s1 = (Student) defaultCons.newInstance();
                String info1 = (String) getInfoMethod.invoke(s1);
                Assert.assertEquals("Student - 000 - K62CB - uet@vnu.edu.vn", info1.trim());

                defaultCons = Student.class.getDeclaredConstructor(String.class, String.class, String.class);
                s1 = (Student) defaultCons.newInstance("Student1", "12340001", "uet@vnu.edu.vn");
                info1 = (String) getInfoMethod.invoke(s1);
                Assert.assertEquals("Student1 - 12340001 - K62CB - uet@vnu.edu.vn", info1.trim());

                defaultCons = Student.class.getDeclaredConstructor(Student.class);
                Student s2 = (Student) defaultCons.newInstance(s1);
                info1 = (String) getInfoMethod.invoke(s2);
              	Assert.assertEquals("Student1 - 12340001 - K62CB - uet@vnu.edu.vn", info1.trim());
            } catch (Exception e) {
                Assert.fail("Exception when invoke method");
            }
        }

        @Test
        public void test_5() {
            try {
                StudentManagement sm = new StudentManagement();
                Student s = new Student();
                setGroupMethod.invoke(s, new String("K62CC"));
                Student s2 = new Student();
                setGroupMethod.invoke(s2, new String("K62CC"));
                Student s3 = new Student();
                setGroupMethod.invoke(s3, "K62CD");

                Assert.assertTrue((Boolean) sameGroupMethod.invoke(sm, s, s2));
                Assert.assertFalse((Boolean) sameGroupMethod.invoke(sm, s, s3));
            } catch (Exception e) {
                Assert.fail("Exception when invoke method");
            }
        }

        @Test
        public void test_check_array_students () {
            try {
                Assert.assertTrue(JavaReflection.checkField(StudentManagement.class, "students", "[LStudent;"));
                Field studentsField = JavaReflection.getField(StudentManagement.class, "students");
                StudentManagement sm = new StudentManagement();
                Student[] students = (Student[]) studentsField.get(sm);
                Assert.assertTrue(students.length >= 4 && students.length <= 100);
                Assert.assertNotNull(addStudentMethod);
            } catch (Exception e) {
                Assert.fail("Encountered Exception");
            }
        }

        private StudentManagement fakeStudentList() throws InvocationTargetException, IllegalAccessException {
            Student s = new Student();
            setNameMethod.invoke(s, "Nguyen Van An");
            setIdMethod.invoke(s, "17020001");
            setGroupMethod.invoke(s, "K62CC");
            setEmailMethod.invoke(s, "17020001@vnu.edu.vn");

            Student s1 = new Student();
            setNameMethod.invoke(s1, "Nguyen Van B");
            setIdMethod.invoke(s1, "17020002");
            setGroupMethod.invoke(s1, "K62CC");
            setEmailMethod.invoke(s1, "17020002@vnu.edu.vn");

            Student s2 = new Student();
            setNameMethod.invoke(s2, "Nguyen Van C");
            setIdMethod.invoke(s2, "17020003");
            setGroupMethod.invoke(s2, "K62CB");
            setEmailMethod.invoke(s2, "17020003@vnu.edu.vn");

            Student s3 = new Student();
            setNameMethod.invoke(s3, "Nguyen Van D");
            setIdMethod.invoke(s3, "17020004");
            setGroupMethod.invoke(s3, "K62CB");
            setEmailMethod.invoke(s3, "17020004@vnu.edu.vn");

            StudentManagement sm = new StudentManagement();
            addStudentMethod.invoke(sm, s);
            addStudentMethod.invoke(sm, s1);
            addStudentMethod.invoke(sm, s2);
            addStudentMethod.invoke(sm, s3);
            return sm;
        }

        @Test
        public void test_group_students() {
            try {
                StudentManagement sm = fakeStudentList();
                String info = (String) studentsByGroupMethod.invoke(sm);
                Assert.assertEquals("K62CC\n" +
                                "Nguyen Van An - 17020001 - K62CC - 17020001@vnu.edu.vn\n" +
                                "Nguyen Van B - 17020002 - K62CC - 17020002@vnu.edu.vn\n" +
                                "K62CB\n" +
                                "Nguyen Van C - 17020003 - K62CB - 17020003@vnu.edu.vn\n" +
                                "Nguyen Van D - 17020004 - K62CB - 17020004@vnu.edu.vn",
                        info.trim());
            } catch (Exception e) {
                Assert.fail("Encountered Exception");
            }
        }

        @Test
        public void test_remove_student() {
            try {
                StudentManagement sm = fakeStudentList();
                removeStudentMethod.invoke(sm, new String("17020002"));
                String info = (String) studentsByGroupMethod.invoke(sm);

                Assert.assertEquals("K62CC\n" +
                                "Nguyen Van An - 17020001 - K62CC - 17020001@vnu.edu.vn\n" +
                                "K62CB\n" +
                                "Nguyen Van C - 17020003 - K62CB - 17020003@vnu.edu.vn\n" +
                                "Nguyen Van D - 17020004 - K62CB - 17020004@vnu.edu.vn",
                        info.trim());
            } catch (Exception e) {
                Assert.fail("Encountered Exception");
            }
        }
    }