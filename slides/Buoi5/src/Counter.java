import java.util.ArrayList;
import java.util.List;

public class Counter {
    static int[] myCopy(int[] a)
    {
        int b[] = new int[a.length];
        for (int i=0; i<a.length; i++)
            b[i] = a[i];
        return b;
    }

    static int[] copy(int[] a)
    {
        int b[] = a;
        return b;
    }

    static void main(String[] args) {
        int a[] = {0, 1, 1, 2, 3, 5, 8};
//        int b[] = Counter.myCopy(a);
        int b[] = Counter.copy(a);
        System.out.println(b);
        System.out.println(a);
        b[0] = 1;
        for (int i=0; i<a.length; i++) {
            System.out.print(a[i] + " ");
        }
        System.out.println();
        for (int i=0; i<b.length; i++) {
            System.out.print(b[i] + " ");
        }
    }


}
