/// <reference path="../pb_data/types.d.ts" />
// Allow admins and inspectors to delete any message (and the message sender
// retains the existing self-delete permission). Hard-delete from PocketBase
// removes the row for every participant — that's exactly the "delete for
// everyone" semantics the product asked for.
//
// Chats: restrict delete to participants only (was: any authed user) and
// continue to allow any participant to remove the whole conversation, which
// also cascades the unread-count derivation in the UI.

migrate((app) => {
  const messages = app.findCollectionByNameOrId('messages');
  messages.deleteRule =
    "senderId = @request.auth.id || " +
    "@request.auth.role = 'admin' || " +
    "@request.auth.role = 'inspector'";
  app.save(messages);

  const chats = app.findCollectionByNameOrId('chats');
  // Any participant can delete; admins/inspectors can always delete.
  chats.deleteRule =
    "participants ~ @request.auth.id || " +
    "@request.auth.role = 'admin' || " +
    "@request.auth.role = 'inspector'";
  app.save(chats);
}, (app) => {
  const messages = app.findCollectionByNameOrId('messages');
  messages.deleteRule = "senderId = @request.auth.id";
  app.save(messages);

  const chats = app.findCollectionByNameOrId('chats');
  chats.deleteRule = "@request.auth.id != ''";
  app.save(chats);
});
