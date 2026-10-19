import Link from "next/link";

const footerLinks = {
  Lists: [
    { name: "Trending", href: "/trending/" },
    { name: "Rising", href: "/rising/" },
    { name: "Hidden gems", href: "/gems/" },
  ],
  Explore: [
    { name: "Radar", href: "/radar/" },
    { name: "Agent toolbox", href: "/toolbox/" },
  ],
  Site: [
    { name: "Categories", href: "/categories/" },
    { name: "About", href: "/about/" },
  ],
};

export function FooterSection() {
  return (
    <footer className="relative border-t border-border bg-background">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
        <div className="py-16 lg:py-20">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-12 lg:gap-8">
            <div className="col-span-2">
              <Link href="/" className="inline-flex items-center gap-2 mb-6">
                <span className="text-2xl font-display text-foreground">Git of Anton</span>
              </Link>
              <p className="text-muted-foreground leading-relaxed max-w-xs text-sm">
                Independent of GitHub. Data from the GitHub API and GH Archive.
              </p>
            </div>

            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-medium text-foreground mb-6">{title}</h3>
                <ul className="space-y-4">
                  {links.map((link) => (
                    <li key={link.name}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="py-8 border-t border-border">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Git of Anton
          </p>
        </div>
      </div>
    </footer>
  );
}
