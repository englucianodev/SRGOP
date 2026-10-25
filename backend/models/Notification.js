import mongoose from 'mongoose';
export default mongoose.model(
  'Notification',
  new mongoose.Schema(
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      title: { type: String, required: true, maxlength: 200 },
      message: { type: String, required: true, maxlength: 1000 },
      occurrence: { type: mongoose.Schema.Types.ObjectId, ref: 'Occurrence' },
      chat: { type: mongoose.Schema.Types.ObjectId, ref: 'CrewChat' },
      chatMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage' },
      read: { type: Boolean, default: false },
      kind: {
        type: String,
        enum: ['despacho', 'apoio', 'sistema', 'chat', 'pendente'],
        default: 'sistema',
      },
    },
    { timestamps: true },
  ),
);
