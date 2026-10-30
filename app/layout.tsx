import './globals.css';

export const metadata={title:'استوديو الفيديو الذكي',description:'إنتاج فيديوهات تعليمية ومسلسلات بالذكاء الاصطناعي مع مونتاج سينمائي'};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="ar" dir="rtl"><head>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet"/>
 </head><body>{children}</body></html>;
}
