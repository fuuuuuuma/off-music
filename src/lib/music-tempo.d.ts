declare module 'music-tempo' {
 export default class MusicTempo {constructor(samples:Float32Array,params:Record<string,number>);tempo:string;beats:number[];agents:{score:number;totalBeatCount:number;beatInterval:number}[];}
}
