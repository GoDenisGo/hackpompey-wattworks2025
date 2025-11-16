(ns dev.user
  (:require [nextjournal.clerk :as clerk]))

(comment
 (clerk/serve! {:browse? true
                :watch-paths ["notebooks"]
                :port 7776})

 (clerk/show! "notebooks/ssen.clj")

 (clerk/halt!))
