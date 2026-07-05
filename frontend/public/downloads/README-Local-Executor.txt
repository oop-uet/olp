OOP Local Executor
==================

Yeu cau:
- Cai JDK 17 tro len, hoac IntelliJ IDEA da co Project SDK/JDK 17+.
- Cong 9876 tren may ca nhan con trong.

Cach chay nhanh:
- macOS: double-click "Start Local Executor.command".
- Windows: double-click "Start Local Executor.bat".
- Linux: double-click hoac chay "./start-local-executor.sh".

Cach chay bang terminal:
java -jar oop-local-executor-1.0.0.jar

Luu y:
- Nen tai file ZIP va giai nen day du truoc khi chay.
- Tren Windows, macOS va Linux, script khoi dong se tu tim Java trong PATH,
  JAVA_HOME, IntelliJ IDEA, JetBrains Toolbox, thu muc .jdks va cac thu muc JDK pho bien.
  Neu IntelliJ da cai nhung van bao khong thay Java, hay vao IntelliJ > File >
  Project Structure > SDKs va them/cai JDK 17+ cho project.
- Neu file tai ve co duoi .html hoac chay java -jar bao "Invalid or corrupt jarfile",
  ban da tai nham trang HTML thay vi file executor. Hay xoa file do va tai lai ZIP tu nut
  "Tai ZIP chay nhanh" tren website.

Khi thay dong "Server started. Waiting for connections at ws://127.0.0.1:9876",
quay lai trang bai lam va bam "Thu ket noi lai".

Neu trinh duyet chan WebSocket, ban moi co them dong HTTP fallback:
http://127.0.0.1:9877/status
