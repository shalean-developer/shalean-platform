import { expect,it,vi } from 'vitest';
import {assignBooking} from '../assignBooking';
vi.mock('../assignCleaner',()=>({assignCleanerToBooking:vi.fn()}));
vi.mock('../assignTeamToBooking',()=>({assignTeamToBooking:vi.fn()}));
import {assignCleanerToBooking} from '../assignCleaner';
it.each([2,3])('does not route a %i-cleaner request into single-winner dispatch',async count=>{
 const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'booking',status:'pending_assignment',cleaner_count:count,cleaner_mode:'individual_cleaners'},error:null})})})})};
 const result=await assignBooking(admin as never,'booking');
 expect(result).toMatchObject({ok:false,error:'no_candidate'});
 expect(assignCleanerToBooking).not.toHaveBeenCalled();
});
