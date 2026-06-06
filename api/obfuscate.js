import crypto from 'crypto';

global.herculesSessions = global.herculesSessions || {};

const SECURE_USER = "admin";
const SECURE_PASS = "hercules2026";

export default function handler(req, res) {
    if (req.method === 'POST') {
        const { action } = req.body;

        if (action === 'login') {
            const { user, pass } = req.body;
            if (user === SECURE_USER && pass === SECURE_PASS) {
                const token = crypto.randomBytes(32).toString('hex');
                global.herculesSessions[token] = true;
                return res.status(200).json({ success: true, token });
            }
            return res.status(401).json({ success: false, error: "" });
        }

        if (action === 'obfuscate') {
            const { token, code } = req.body;
            
            if (!token || !global.herculesSessions[token]) {
                return res.status(403).json({ error: "السكربت معطل" });
            }
            if (!code) return res.status(400).json({ error: "Code is missing" });

            const encryptedPayload = Buffer.from(code, 'utf8').toString('hex');

            return res.status(200).json({
                success: true,
                payload: encryptedPayload
            });
        }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(403).send('<h2 style="color:red; text-align:center; margin-top:50px;">تبي تفك حاول هههههههههههههههههههههههه</h2>');
}
