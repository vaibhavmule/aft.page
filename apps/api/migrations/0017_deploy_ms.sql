-- Machine time-to-URL: Worker receive → URL minted (ms). Null on old rows / absorb.
ALTER TABLE deploys ADD COLUMN ms INTEGER;
