// Isolated sample data for a labelled preview. Never calls a live backend.
import { demoUsers, getDemoUser } from '@/lib/previewMode.js';
const stamp = new Date().toISOString();
const future = new Date(Date.now() + 86400000).toISOString();
const staff = demoUsers[1];
const customer = demoUsers[2];
const blank = { inspector: staff.id, inspectorName: staff.name, customer: customer.id,
  version: 1, propertyType: 'Residential', areaCalculations: [], propertyMetrics: [],
  waterQuality: {}, roomInspections: [], scoreOverrides: {}, deletedAt: null, created: stamp, updated: stamp };
const initial = {
  users: demoUsers, settings: {}, messages: [], chats: [], downloads: [],
  inspections: [
    { ...blank, id: '00000000-0000-4000-c000-000000000021', status: 'pending', metadata: { propertyAddress: 'Lakeside Residences · Apartment 402', preparedFor: customer.name, inspectionDate: stamp.slice(0,10) } },
    { ...blank, id: '00000000-0000-4000-c000-000000000022', status: 'approved', approvedBy: demoUsers[0].id, approvedAt: stamp, metadata: { propertyAddress: 'Green Meadows · Villa 18', preparedFor: customer.name, inspectionDate: stamp.slice(0,10) } },
    { ...blank, id: '00000000-0000-4000-c000-000000000023', status: 'draft', metadata: { propertyAddress: 'Skyline Heights · Apartment 705', preparedFor: customer.name, inspectionDate: stamp.slice(0,10) } },
  ],
  appointments: [
    { id:'00000000-0000-4000-b000-000000000021',customer:customer.id,inspector:null,inspection:null,status:'scheduled',scheduledAt:future,timeSlot:'10:00 AM',propertyAddress:'Oakwood Apartments · Flat 203',notes:'Sample booking awaiting assignment' },
    { id:'00000000-0000-4000-b000-000000000022',customer:customer.id,inspector:staff.id,inspection:null,status:'scheduled',scheduledAt:future,timeSlot:'2:00 PM',propertyAddress:'Palm Grove · Villa 7',notes:'Sample assigned booking' },
  ],
};
let state;
try { state = JSON.parse(localStorage.getItem('checksquare-preview-data')) || structuredClone(initial); }
catch { state = structuredClone(initial); }
const commit = () => { try { localStorage.setItem('checksquare-preview-data',JSON.stringify(state)); } catch { /* ephemeral preview */ } };
const copy = (value) => structuredClone(value);
function filtered(rows, filter='') {
  return rows.filter((row) => filter.split('&&').every((part) => {
    if (!part.trim()) return true;
    const match = /^(\w+)\s*(>=|!=|=)\s*(?:"([^"]*)"|(null))$/.exec(part.trim());
    if (!match) return true;
    const value = match[4] ? null : match[3];
    const current = row[match[1]] ?? null;
    return match[2] === '=' ? current === value : match[2] === '!=' ? current !== value : current >= value;
  }));
}
function visible(row) {
  const user = getDemoUser();
  return user.role === 'admin' || row.inspector === user.id || (row.customer === user.id && row.status === 'approved');
}
const adapter = {
  async listInspections({filter=''}={}) { return copy(filtered(state.inspections.filter(visible),filter)); },
  async getInspection(id) { const row=state.inspections.find((x)=>x.id===id && visible(x)); if(!row) throw new Error('Sample report unavailable'); return copy(row); },
  async upsertInspection(payload) {
    const old=state.inspections.find((row)=>row.id===payload.id);
    if(old && old.version !== payload.version) throw new Error('Report changed. Reload before saving.');
    const next={...blank,...old,...payload,id:payload.id||crypto.randomUUID(),version:(old?.version||0)+1,updated:new Date().toISOString()};
    state.inspections=state.inspections.filter((row)=>row.id!==next.id).concat(next);
    const appointment=state.appointments.find((row)=>row.id===next.metadata?.appointmentId);
    if(appointment) { appointment.inspection=next.id; appointment.status=next.status==='approved'?'completed':'in_progress'; }
    commit(); return copy(next);
  },
  async updateInspection(id,payload) { const old=await this.getInspection(id); return this.upsertInspection({...old,...payload,id,version:payload.version??old.version}); },
  async deleteInspection(id) {state.inspections=state.inspections.filter((x)=>x.id!==id);commit();},
  async listAppointments({filter=''}={}) {const user=getDemoUser();return copy(filtered(state.appointments.filter((row)=>user.role==='admin'||row.customer===user.id||row.inspector===user.id),filter));},
  async createAppointment(payload) {const row={...payload,id:crypto.randomUUID(),created:stamp};state.appointments.push(row);commit();return copy(row);},
  async updateAppointment(id,payload) {const row=state.appointments.find((x)=>x.id===id);if(!row)throw new Error('Sample booking unavailable');Object.assign(row,payload);commit();return copy(row);},
  async listUsers({filter=''}={}) {return copy(filtered(state.users,filter));},
  async listUsersByRole(role) {return copy(state.users.filter((x)=>x.role===role));},
  async getUser(id) {return copy(state.users.find((x)=>x.id===id));},
  async createUser(payload) {const { password: _password,passwordConfirm: _confirmation,...safe }=payload;const row={...safe,id:crypto.randomUUID()};state.users.push(row);commit();return copy(row);},
  async updateUser(id,payload) {const row=state.users.find((x)=>x.id===id);Object.assign(row,payload);commit();return copy(row);},
  async deleteUser(id) {state.users=state.users.filter((x)=>x.id!==id);commit();},
  async listChats(id) {return copy(state.chats.filter((x)=>x.participants.includes(id)));},
  async ensureSupportChat() {return this.createChat({type:'group',participants:[getDemoUser().id,demoUsers[0].id]});},
  async findChat() {return null;},
  async createChat(payload) {const row={...payload,id:crypto.randomUUID()};state.chats.push(row);commit();return copy(row);},
  async deleteChat(id) {state.chats=state.chats.filter((x)=>x.id!==id);commit();},
  async listMessages(chatId) {return copy(state.messages.filter((x)=>x.chatId===chatId));},
  async sendMessage(payload) {const row={...payload,id:crypto.randomUUID(),created:stamp};state.messages.push(row);commit();return copy(row);},
  async updateMessage() {}, async deleteMessage(id) {state.messages=state.messages.filter((x)=>x.id!==id);commit();},
  async getAppSettings() {return copy(state.settings);},
  async upsertAppSettings(payload) {state.settings=copy(payload);commit();},
  async listReportDownloads() {return [];},
  subscribe() {return ()=>{};},
};
export default adapter;
