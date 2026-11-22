import java.io.*;
import java.util.*;
import java.util.zip.*;

public class PatchApk {
    public static void main(String[] args) throws Exception {
        if (args.length < 5) {
            System.err.println("Usage: java PatchApk.java <baseApk> <outApk> <hbcBundle> <oldVerCode> <newVerCode>");
            System.exit(1);
        }
        String baseApkPath = args[0];
        String outApkPath = args[1];
        String hbcPath = args[2];
        int oldVer = Integer.parseInt(args[3]);
        int newVer = Integer.parseInt(args[4]);

        byte[] newBundle = readAllBytes(new File(hbcPath));
        int copied = 0;
        int storedCount = 0;
        boolean replacedBundle = false;
        boolean patchedManifest = false;

        try (ZipFile zf = new ZipFile(baseApkPath);
             ZipOutputStream zos = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(outApkPath)))) {
            Enumeration<? extends ZipEntry> entries = zf.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();

                // Drop old JAR signature files so apksigner can cleanly re-sign
                if (name.startsWith("META-INF/") && !entry.isDirectory()) {
                    continue;
                }
                if (entry.isDirectory()) {
                    continue;
                }

                byte[] data;
                if (name.equals("assets/index.android.bundle")) {
                    data = newBundle;
                    replacedBundle = true;
                } else {
                    try (InputStream is = zf.getInputStream(entry)) {
                        data = readAllBytes(is);
                    }
                    if (name.equals("AndroidManifest.xml")) {
                        int patched = patchVersionCode(data, oldVer, newVer);
                        if (patched == 0) {
                            throw new RuntimeException("versionCode " + oldVer + " not found in AndroidManifest.xml");
                        }
                        System.out.println("Patched AndroidManifest.xml versionCode " + oldVer + " -> " + newVer + " (count=" + patched + ")");
                        patchedManifest = true;
                    }
                }

                // Preserve original compression method (crucial for resources.arsc and .so!)
                boolean keepStored = (entry.getMethod() == ZipEntry.STORED)
                        || name.equals("resources.arsc")
                        || name.endsWith(".so");

                ZipEntry outEntry = new ZipEntry(name);
                outEntry.setTime(entry.getTime());

                if (keepStored) {
                    outEntry.setMethod(ZipEntry.STORED);
                    outEntry.setSize(data.length);
                    outEntry.setCompressedSize(data.length);
                    CRC32 crc = new CRC32();
                    crc.update(data);
                    outEntry.setCrc(crc.getValue());
                    storedCount++;
                } else {
                    outEntry.setMethod(ZipEntry.DEFLATED);
                }

                zos.putNextEntry(outEntry);
                zos.write(data);
                zos.closeEntry();
                copied++;
            }

            if (!replacedBundle) {
                ZipEntry outEntry = new ZipEntry("assets/index.android.bundle");
                outEntry.setMethod(ZipEntry.DEFLATED);
                zos.putNextEntry(outEntry);
                zos.write(newBundle);
                zos.closeEntry();
                replacedBundle = true;
            }
        }

        if (!patchedManifest) {
            throw new RuntimeException("AndroidManifest.xml was not found in base APK");
        }
        System.out.println("Successfully patched APK: entries=" + copied + ", stored=" + storedCount + ", bundleBytes=" + newBundle.length);
    }

    private static int patchVersionCode(byte[] buf, int oldVer, int newVer) {
        int count = 0;
        byte o0 = (byte) (oldVer & 0xFF);
        byte o1 = (byte) ((oldVer >> 8) & 0xFF);
        byte o2 = (byte) ((oldVer >> 16) & 0xFF);
        byte o3 = (byte) ((oldVer >> 24) & 0xFF);

        byte n0 = (byte) (newVer & 0xFF);
        byte n1 = (byte) ((newVer >> 8) & 0xFF);
        byte n2 = (byte) ((newVer >> 16) & 0xFF);
        byte n3 = (byte) ((newVer >> 24) & 0xFF);

        for (int i = 0; i <= buf.length - 8; i++) {
            if (buf[i] == 0x08 && buf[i + 1] == 0x00 && buf[i + 2] == 0x00 && buf[i + 3] == 0x10
                    && buf[i + 4] == o0 && buf[i + 5] == o1 && buf[i + 6] == o2 && buf[i + 7] == o3) {
                buf[i + 4] = n0;
                buf[i + 5] = n1;
                buf[i + 6] = n2;
                buf[i + 7] = n3;
                count++;
            }
        }
        return count;
    }

    private static byte[] readAllBytes(File f) throws IOException {
        try (InputStream is = new FileInputStream(f)) {
            return readAllBytes(is);
        }
    }

    private static byte[] readAllBytes(InputStream is) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] tmp = new byte[65536];
        int r;
        while ((r = is.read(tmp)) != -1) {
            baos.write(tmp, 0, r);
        }
        return baos.toByteArray();
    }
}
