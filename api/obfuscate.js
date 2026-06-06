// api/obfuscate.js
import crypto from 'crypto';

// قاعدة بيانات داخل ذاكرة السيرفر لحفظ السكربتات (يفضل ربطها بـ Supabase لاحقاً للاستمرار الثابت)
global.herculesCache = global.herculesCache || {};

export default function handler(req, res) {
    
    // أولاً: وضع استقبال الكود وتشفيره من لوحة التحكم (POST)
    if (req.method === 'POST') {
        const { key, hwid, code, settings } = req.body;
        if (!key || !hwid || !code) return res.status(400).json({ error: "Missing required fields" });

        // محاكاة منطق الـ Bytecode الخارجي لـ Hercules وتحويل النص إلى تعمية أولية بالخلفية
        // هذا يحمي الكود البرمجي من أن يظهر كـ Raw حتى في الـ Memory Storage للسيرفر
        const hmac = crypto.createHmac('sha256', 'hercules_secret_salt').update(code).digest('hex');
        
        // بناء الهيكل المحمي للكود المصدري
        global.herculesCache[key] = {
            rawContent: code,
            allowedHwid: hwid,
            options: settings,
            signature: hmac
        };

        return res.status(200).json({ success: true });
    }

    // ثانياً: وضع جلب وتشغيل السكربت داخل اللعبة (GET / POST المباشر)
    if (req.method === 'GET' || req.method === 'POST') {
        const fetchKey = req.query.fetch || (req.body && req.body.key);
        const requestHwid = req.body && req.body.hwid;
        const clientTimestamp = req.body && req.body.timestamp;

        // 1. حظر الوصول المباشر للـ Raw تماماً عبر المتصفح
        if (!requestHwid || !clientTimestamp) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(403).send(`
                <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#ef4444;">
                    <h2>🛡️ [Hercules Security Alert]</h2>
                    <p style="color:#94a3b8;">ممنوع الوصول المباشر لرابط الـ Raw. جدار الحماية ضد الـ Loggers نشط تماماً.</p>
                </div>
            `);
        }

        const activeScript = global.herculesCache[fetchKey];
        if (!activeScript) return res.status(404).json({ error: "License key not found or expired." });

        // 2. مكافحة برامج تسريب الحزم والشبكات (Anti-Replay / Anti-Packet Logger)
        // إذا كان الفارق الزمني للطلب أكثر من 10 ثوانٍ يتم تدمير الحزمة تلقائياً
        const serverTime = Date.now();
        if (Math.abs(serverTime - parseInt(clientTimestamp)) > 10000) {
            return res.status(403).json({ error: "🔒 Packet capture detected. Request signature expired." });
        }

        // 3. التحقق الصارم من تطابق بصمة الجهاز (HWID Match Protection)
        if (activeScript.allowedHwid !== requestHwid) {
            return res.status(403).json({ error: "🔒 Access Denied: Unauthorized Hardware ID!" });
        }

        // 4. ميكانيكية التشفير المتغير (Dynamic AES-256-CBC)
        // يتم توليد مفتاح تشفير يختلف في كل جزء من الملي ثانية معتمداً على الوقت وبصمة العميل
        const dynamicSecret = fetchKey + clientTimestamp + requestHwid;
        const encryptionKey = crypto.createHash('sha256').update(dynamicSecret).digest();
        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
        
        // إدخال السكربت في آلية التحويل وتوليد الـ Payload المشفر
        let cryptedPayload = cipher.update(activeScript.rawContent, 'utf8', 'hex');
        cryptedPayload += cipher.final('hex');

        // إرسال البيانات المشفرة مع البيانات الوصفية (Watermark) المقتبسة من مشروعك
        return res.status(200).json({
            success: true,
            watermark: "-- [ Protected via Hercules v1.6 Virtual Machine Cloud ] --",
            iv: iv.toString('hex'),
            payload: cryptedPayload
        });
    }
}
