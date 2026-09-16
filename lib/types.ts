export type Variable = 'temperature' | 'salinity' | 'pressure';
export type Region = 'Bay of Bengal' | 'Arabian Sea';
export type Sample = {depth:number; pressure:number; temperature:number|null; salinity:number|null; pressure_qc?:string; temperature_qc?:string; salinity_qc?:string};
export type Profile = {float_id:string; profile_id:string; timestamp:string; latitude:number; longitude:number; source:string; samples:Sample[]; cycle?:number; data_mode?:string; position_qc?:string; time_qc?:string};
export type OceanData = {status:'active'|'waiting'|'error'; message:string; profiles:Profile[]; last_sync:string|null; trajectories?:TrajectoryRecord[]; dataset_label?:string; source_files?:{url:string;sha256:string;bytes:number}[]};
export const WAITING = 'Waiting for ARGO data connection.';
export const emptyData:OceanData = {status:'waiting',message:WAITING,profiles:[],last_sync:null};
export const inRegion = (p:Profile,region:Region) => region==='Bay of Bengal' ? p.latitude>=5&&p.latitude<=23&&p.longitude>=80&&p.longitude<=100 : p.latitude>=0&&p.latitude<=26&&p.longitude>=50&&p.longitude<80;

export type TrajectoryRecord={float_id:string;cycle:number;timestamp:string;source:string;record_index:number;measurement_code:number;latitude:number|null;longitude:number|null;pressure:number|null;pressure_qc:string|null;position_qc:string|null;time_qc:string;data_mode:string};
