'use client';

import { MenuIcon, XIcon } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { buttonVariants } from '@/components/ui/button';
import {
  NavItemMobile,
  type NavItemType,
} from '@/components/ui/navigation-menu';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * Mobile navigation drawer for the marketing header: grouped links in an
 * accordion, mirroring the desktop NavigationMenu dropdowns.
 */
export function MobileSiteNav({
  productLinks,
  learnLinks,
}: {
  productLinks: NavItemType[];
  learnLinks: NavItemType[];
}) {
  const sections = [
    { id: 'product', name: 'Product', list: productLinks },
    { id: 'learn', name: 'Learn', list: learnLinks },
  ];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'rounded-full lg:hidden')}
          aria-label="Open navigation menu"
        >
          <MenuIcon className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent className="bg-background/95 supports-[backdrop-filter]:bg-background/80 w-full gap-0 backdrop-blur-lg" showClose={false}>
        <SheetTitle className="sr-only">TraceGraph navigation</SheetTitle>
        <SheetDescription className="sr-only">Browse TraceGraph product and learning links</SheetDescription>

        <div className="flex h-14 items-center justify-end border-b px-4">
          <SheetClose asChild>
            <button
              type="button"
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'rounded-full')}
              aria-label="Close navigation menu"
            >
              <XIcon className="size-5" />
            </button>
          </SheetClose>
        </div>

        <div className="container grid gap-y-2 overflow-y-auto px-4 pt-5 pb-12">
          <Accordion type="single" collapsible defaultValue="product">
            {sections.map((section) => (
              <AccordionItem key={section.id} value={section.id}>
                <AccordionTrigger className="capitalize hover:no-underline">
                  {section.name}
                </AccordionTrigger>
                <AccordionContent className="space-y-1">
                  <ul className="grid gap-1">
                    {section.list.map((link) => (
                      <li key={`${section.id}-${link.href}`}>
                        <SheetClose asChild>
                          <NavItemMobile item={link} href={link.href} />
                        </SheetClose>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  );
}
