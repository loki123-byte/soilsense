import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import Layout from "@/components/soilsense/Layout";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <Layout>
      <section className="py-24">
        <div className="container text-center">
          <h1 className="font-display text-5xl font-semibold">404</h1>
          <p className="mt-3 text-foreground/80">Oops! Page not found</p>
          <a href="/" className="inline-block mt-6 px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">Return to Home</a>
        </div>
      </section>
    </Layout>
  );
};

export default NotFound;
