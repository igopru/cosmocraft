// registration.ts
import { Router } from 'express';
import { pool } from './database';
import { hashPassword, isValidEmail } from './utils/auth';
import { sendVerificationEmail } from './utils/email';
import { Request, Response } from 'express';

export const registerUser = async (req: Request, res: Response) => {
    const { email, password } = req.body;
    
    // 🔐 1. Валидация
    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Некорректный email' });
    }
    
    // 🔄 2. Проверка дубликатов
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
        return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }
    
    // 🔐 3. Хэширование пароля
    const hashedPassword = await hashPassword(password);
    
    // 🚀 4. Вставка в БД
    const [result] = await pool.query(
        'INSERT INTO users (email, password) VALUES (?, ?)',
        [email, hashedPassword]
    );
    
    // 📧 5. Отправка кода верификации
    const verificationCode = Math.floor(100000 + Math.random() * 900000);
    await sendVerificationEmail(email, verificationCode);
    
    res.status(201).json({
        message: 'Пользователь зарегистрирован!
На ваш email отправлен код подтверждения',
        userId: result.insertId
    });
};

export const verifyEmail = async (req: Request, res: Response) => {
    const { code } = req.body;
    // Логика проверки кода и активации аккаунта
};

