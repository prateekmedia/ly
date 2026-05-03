import LyHeader from "../../shared/components/LyHeader";

const HomePage = () => {
  return (
    <>
      <LyHeader />
      <textarea
        className="h-[320px] w-full resize-none border-0 bg-transparent px-8 py-10 text-4xl leading-tight outline-none placeholder:text-neutral-300 focus:ring-0"
        placeholder="Remove background from the image"
        autoFocus
      />
      <div className="flex justify-between px-8">
        <button>Choose files</button>
        <div>
          <button className="pr-4">Auto</button>
          <button>Submit</button>
        </div>
      </div>
    </>
  );
};

export default HomePage;
