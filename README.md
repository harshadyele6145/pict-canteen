# 🍽️ PICT College Canteen Management System

A full-stack web-based canteen management system developed for **PICT College** to simplify food ordering, online payment, pickup-slot management, stock management, and canteen order processing.

The system supports both **live orders and today's preorders**, with Razorpay payment verification and QR/token-based pickup verification.

---

## 🚀 Features

### 👨‍🎓 Student

- Student registration and login
- Browse available food items
- View food prices, categories, stock, and availability
- Add items to cart
- Select today's pickup slot
- Choose:
  - Live Order
  - Preorder
- Online payment using Razorpay
- Secure payment verification
- Automatic order placement after successful payment
- Receive a unique pickup token
- View pickup QR code
- View previous orders
- Real-time menu and order updates

### 👨‍💼 Admin / Canteen Staff

- Secure admin login
- View today's paid orders
- Preparation queue sorted by pickup time
- Add new menu items
- Update food stock
- Increase/decrease stock
- Enable/disable food availability
- Monitor orders in real time
- Scan student pickup QR codes
- Manually verify Order ID + Pickup Token
- Mark order as completed after successful pickup verification

---

## 🔄 Order Flow

```text
Student
   ↓
Select Food
   ↓
Select Today's Pickup Slot
   ↓
Choose Live / Preorder
   ↓
Razorpay Payment
   ↓
Backend Payment Verification
   ↓
ORDER = PLACED
   ↓
Admin Preparation Queue
   ↓
Food Prepared Before Pickup Slot
   ↓
Student Arrives
   ↓
QR / Pickup Token Verification
   ↓
ORDER = COMPLETED