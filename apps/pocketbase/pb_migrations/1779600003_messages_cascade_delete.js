/// <reference path="../pb_data/types.d.ts" />
// Enable cascade delete on messages.chatId so removing a chat atomically
// removes every message that referenced it. Without this, chat deletion
// fails whenever the actor lacks per-message delete permission (e.g. an
// admin deleting a group that contains another user's messages).

migrate((app) => {
  const messages = app.findCollectionByNameOrId('messages');
  const chatField = messages.fields.find((f) => f.name === 'chatId');
  if (chatField) {
    chatField.cascadeDelete = true;
    app.save(messages);
  }
}, (app) => {
  const messages = app.findCollectionByNameOrId('messages');
  const chatField = messages.fields.find((f) => f.name === 'chatId');
  if (chatField) {
    chatField.cascadeDelete = false;
    app.save(messages);
  }
});
