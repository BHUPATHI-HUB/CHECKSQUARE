// Apply after the existing schema. Public clients cannot grant privileges.
migrate((app) => {
  const admin = "@request.auth.role = 'admin'";
  const users = app.findCollectionByNameOrId('users');
  users.createRule = `(${admin}) || @request.body.role = 'customer'`;
  users.updateRule = `(${admin}) || (id = @request.auth.id && @request.body.role:changed = false)`;
  users.manageRule = admin;
  app.save(users);

  const inspections = app.findCollectionByNameOrId('inspections');
  inspections.createRule = `(${admin}) || (@request.auth.role = 'inspector' && @request.body.inspector = @request.auth.id && (@request.body.status = 'draft' || @request.body.status = 'pending') && @request.body.approvedBy:isset = false && @request.body.approvedAt:isset = false && @request.body.deletedAt:isset = false)`;
  inspections.updateRule = `(${admin}) || (@request.auth.role = 'inspector' && inspector = @request.auth.id && (status = 'draft' || status = 'rejected') && (@request.body.status:changed = false || @request.body.status = 'draft' || @request.body.status = 'pending') && @request.body.inspector:changed = false && @request.body.customer:changed = false && @request.body.approvedBy:changed = false && @request.body.approvedAt:changed = false && @request.body.deletedAt:changed = false && @request.body.deletedBy:changed = false)`;
  app.save(inspections);

  const chats = app.findCollectionByNameOrId('chats');
  chats.listRule = chats.viewRule = `(${admin}) || participants ?= @request.auth.id`;
  chats.createRule = "@request.auth.id != '' && @request.body.participants ?= @request.auth.id";
  chats.updateRule = admin;
  chats.deleteRule = `(${admin}) || participants ?= @request.auth.id`;
  app.save(chats);

  const messages = app.findCollectionByNameOrId('messages');
  const member = 'chatId.participants ?= @request.auth.id';
  messages.listRule = messages.viewRule = `(${admin}) || (${member})`;
  messages.createRule = `@request.auth.id != '' && @request.body.senderId = @request.auth.id && (${member})`;
  // Read receipts are the only mutable message field for participants.
  messages.updateRule = `(${member}) && @request.body.chatId:changed = false && @request.body.senderId:changed = false && @request.body.senderName:changed = false && @request.body.senderRole:changed = false && @request.body.content:changed = false`;
  messages.deleteRule = `(${admin}) || ((${member}) && (senderId = @request.auth.id || @request.auth.role = 'inspector'))`;
  app.save(messages);
}, () => {
  throw new Error('Security rules cannot be automatically reverted to unrestricted access.');
});
