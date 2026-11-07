// Vanta and its three r134 build ship without types. Only the overview header's fog uses them.
declare module "vanta/dist/vanta.fog.min" {
  const fog: (options: Record<string, unknown>) => { destroy: () => void };
  export default fog;
}

declare module "three-vanta";
