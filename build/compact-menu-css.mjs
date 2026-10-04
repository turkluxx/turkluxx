import {readFile,writeFile} from 'node:fs/promises';
const p='css/homepage-desktop.css';let s=await readFile(p,'utf8');const start=s.indexOf('    .turkluxx-homepage .turkluxx-home-desktop-nav {');const end=s.indexOf('\n}\n',start);let block=s.slice(start,end);
block=block.replaceAll('.turkluxx-homepage .turkluxx-home-desktop-nav',':is(.turkluxx-homepage .turkluxx-home-desktop-nav, .rengi-header-shell .turkluxx-sales-nav)');
block=block.replace('padding: 12px;','padding: 4px 12px;').replace('padding: 10px 0;','padding: 6px 0;');
block=block.replace("a[data-home-scroll='properties']", "a:is([data-home-scroll='properties'], [href='./#turkluxx-project-heading'])");
block+=`\n\n    :is(.turkluxx-homepage .turkluxx-home-desktop-nav, .rengi-header-shell .turkluxx-sales-nav) a[data-home-scroll='location'] {
        --turkluxx-mobile-nav-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23d8b66a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z'/%3E%3Ccircle cx='12' cy='10' r='2.5'/%3E%3C/svg%3E");
    }`;
s=s.slice(0,start)+block+s.slice(end);await writeFile(p,s);
