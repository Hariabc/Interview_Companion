import type { Metadata } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
    subsets: ['latin'],
    variable: '--font-manrope',
    display: 'swap'
});

const spaceGrotesk = Space_Grotesk({
    subsets: ['latin'],
    variable: '--font-space-grotesk',
    display: 'swap'
});

export const metadata: Metadata = {
    title: 'Interview Companion',
    description: 'AI-powered mock interviews with voice analysis and coding rounds.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={`${manrope.variable} ${spaceGrotesk.variable}`} style={{ fontFamily: 'var(--font-manrope), sans-serif' }} suppressHydrationWarning={true}>
                {children}
            </body>
        </html>
    );
}
