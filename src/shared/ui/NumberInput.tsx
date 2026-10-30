"use client";
import { useState, type InputHTMLAttributes } from "react";
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange"|"type"> & {value:number;onValueChange:(value:number)=>void};
export default function NumberInput({value,onValueChange,...props}:Props){
 const [state,setState]=useState({value,draft:String(value)});
 if(value!==state.value)setState({value,draft:String(value)});
 return <input {...props} type="number" value={state.draft} onChange={event=>{const draft=event.target.value;const next=draft===""?0:Number(draft);setState({value:next,draft});onValueChange(next);}}/>;
}
