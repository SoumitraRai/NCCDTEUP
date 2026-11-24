import 'dotenv/config';
import {z} from 'zod';
import {hashPassword} from 'better-auth/crypto';
import {db} from '../src/server/db';
import {audit} from '../src/modules/audit';
// Read credentials through stdin, never shell arguments or logs.
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const input=z.object({name:z.string().min(2).max(100),email:z.string().email(),password:z.string().min(14),institutionId:z.string(),role:z.enum(['CADET','ANO','CO','GROUP','ADMIN']),appointmentCode:z.string().optional(),operatorId:z.string().min(3)}).strict().parse(JSON.parse(raw));
const inst=await db.institution.findUniqueOrThrow({where:{id:input.institutionId},include:{unit:{include:{group:true}}}});
// Formation roles sit on the formation, not the institution used to locate it.
// The post must sit at the same level as the role's formation (e.g. ADG at the directorate).
if(input.appointmentCode){const post=await db.appointment.findUniqueOrThrow({where:{code:input.appointmentCode}});if(post.role!==input.role)throw new Error(`Post ${post.code} carries role ${post.role}, not ${input.role}.`);}
const anchor=input.role==='CO'?{level:'UNIT',unitId:inst.unitId}:input.role==='GROUP'?{level:'GROUP',groupId:inst.unit.groupId}:input.role==='ADMIN'?{level:'DIRECTORATE',directorateId:inst.unit.group.directorateId}:{institutionId:inst.id};
const password=await hashPassword(input.password);const id=crypto.randomUUID();await db.$transaction(async tx=>{await tx.user.create({data:{id,name:input.name,email:input.email,emailVerified:false,accounts:{create:{id:crypto.randomUUID(),accountId:id,providerId:'credential',password}},requireTwoFactor:['CO','GROUP','ADMIN'].includes(input.role),assignments:{create:{...anchor,role:input.role,appointmentCode:input.appointmentCode??null,capabilities:[]}}}});await audit(tx,input.operatorId,'user.provisioned',id,{role:input.role});});console.log('Account provisioned. Explicit payment/publishing capabilities must be assigned by another administrator.');await db.$disconnect();
