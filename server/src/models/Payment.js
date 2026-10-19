import mongoose from 'mongoose';

// Mock payment record. Shaped like a gateway order so a real provider
// (Razorpay, Cashfree, ...) can replace the mock confirm step later.
const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true },
    amount: { type: Number, required: true }, // INR
    currency: { type: String, default: 'INR' },
    provider: { type: String, default: '' }, // mock | razorpay | cashfree | phonepe (the gateway last used)
    // Every time the player opens a gateway's checkout we create an order there; any of them may get paid.
    attempts: {
      type: [new mongoose.Schema({ provider: String, gatewayOrderId: String, attemptId: String, at: Date }, { _id: false })],
      default: [],
    },
    gatewayPaymentId: { type: String, default: '' },
    method: { type: String, default: '' }, // upi / card / netbanking (mock)
    // processing: payment confirmed by the gateway, seat being reserved right now (a few ms)
    // refund_pending: the tournament was deleted/cancelled and the money still has to be returned by an admin
    status: { type: String, enum: ['created', 'processing', 'paid', 'failed', 'refund_pending', 'refunded'], default: 'created' },
    refundedAt: { type: Date, default: null },
    refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    paidAt: { type: Date, default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Payment', paymentSchema);
