// api/obfuscate.js
import crypto from 'crypto';

global.herculesSecureStorage = global.herculesSecureStorage || {};
global.herculesSessions = global.herculesSessions || {};

// البيانات المحمية داخل السيرفر (يمكنك تغييرها من هنا بأمان تام)
const SECURE_USER = "admin";
const SECURE_PASS = "hercules2026";

const SERVER_MASTER_KEY = crypto.createHash('sha256').update('HERCULES_INTERNAL_SECURE_SALT_2026').digest();

function encryptServerData(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', SERVER_MASTER_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return { encrypted, iv: iv.toString('hex'), tag: authTag };
}

function decryptServerData(encData) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', SERVER_MASTER_KEY, Buffer.from(encData.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encData.tag, 'hex'));
    let decrypted = decipher.update(encData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export default function handler(req, res) {
    
    // وضع جلب الـ Raw المباشر عبر الـ GET للعبة
    if (req.method === 'GET' && req.query.fetch) {
        const key = req.query.fetch;
        const isRawRequest = req.query.raw === 'true';
        const secureRecord = global.herculesSecureStorage[key];

        if (!secureRecord) return res.status(404).send('-- License key not found.');
        const decryptedRecord = JSON.parse(decryptServerData(secureRecord));

        if (isRawRequest && decryptedRecord.isRawScript) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(200).send(decryptedRecord.rawContent);
        }
        return res.status(403).send('-- Unauthorized direct access.');
    }

    // معالجة طلبات الـ POST (تسجيل الدخول والتشفير)
    if (req.method === 'POST') {
        const { action } = req.body;

        // 1. نظام التحقق الآمن من تسجيل الدخول على السيرفر الخلفي
        if (action === 'login') {
            const { user, pass } = req.body;
            if (user === SECURE_USER && pass === SECURE_PASS) {
                const token = crypto.randomBytes(32).toString('hex');
                global.herculesSessions[token] = true; // إنشاء جلسة صالحة للرفع
                return res.status(200).json({ success: true, token });
            }
            return res.status(401).json({ success: false, error: "Invalid credentials" });
        }

        // 2. استقبال وتشفير البيانات (يتطلب توكن جلسة فعال لحمايته من الـ Bypass)
        if (action === 'obfuscate') {
            const { token, key, hwid, code, isRaw } = req.body;
            
            if (!token || !global.herculesSessions[token]) {
                return res.status(403).json({ error: "🛡️ Unauthorized Action: Session expired or invalid." });
            }
            if (!key || !code) return res.status(400).json({ error: "Data incomplete" });

            global.herculesSecureStorage[key] = encryptServerData(JSON.stringify({
                rawContent: code,
                allowedHwid: hwid || null,
                isRawScript: !!isRaw
            }));

            return res.status(200).json({ success: true });
        }

        // 3. معالجة التحقق الموجه من داخل اللعبة (طلب التحقق العادي)
        if (req.body.timestamp) {
            const { key, hwid, timestamp } = req.body;
            const secureRecord = global.herculesSecureStorage[key];

            if (!secureRecord) return res.status(404).json({ error: "License key validation failed." });
            const decryptedRecord = JSON.parse(decryptServerData(secureRecord));

            if (decryptedRecord.isRawScript) {
                return res.status(403).json({ error: "This key is configured for RAW execution only." });
            }
            if (decryptedRecord.allowedHwid !== hwid) {
                return res.status(403).json({ error: "🔒 Device unauthorized!" });
            }
            if (Math.abs(Date.now() - parseInt(timestamp)) > 10000) {
                return res.status(403).json({ error: "🔒 Packet signature expired." });
            }

            const dynamicSecret = key + timestamp + hwid;
            const bufferContent = Buffer.from(decryptedRecord.rawContent, 'utf8');
            const keyBuffer = Buffer.from(dynamicSecret, 'utf8');
            const encryptedPayload = Buffer.alloc(bufferContent.length);

            for (let i = 0; i < bufferContent.length; i++) {
                encryptedPayload[i] = bufferContent[i] ^ keyBuffer[i % keyBuffer.length];
            }

            return res.status(200).json({
                success: true,
                payload: encryptedPayload.toString('hex')
            });
        }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(403).send('<h2 style="color:red; text-align:center; margin-top:50px;">🛡️ [جدار حماية Hercules السحابي نشط]</h2>');
}
