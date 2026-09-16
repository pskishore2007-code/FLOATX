import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'FLOATX — Ocean, in every dimension',description:'Explore the Indian Ocean across space, depth and time. A real ARGO data exploration workspace.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
