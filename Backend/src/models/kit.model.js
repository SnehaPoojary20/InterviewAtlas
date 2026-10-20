
import mongoose, { Schema } from "mongoose";

const kitSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    caseId: {
      type: String,
      default: null,
      index: true,
    },

    kitData: {
      source: {
        company: {
          type: String,
          default: "",
        },
        company_url: {
          type: String,
          default: "",
        },
        role: {
          type: String,
          default: "",
        },
        location: {
          type: String,
          default: "Not specified",
        },
        jd_chars: {
          type: Number,
          default: 0,
        },
        researched_at: {
          type: String,
          default: "",
        },
        pages_used: {
          type: [String],
          default: [],
        },
      },

      company_brief: {
        summary: {
          type: String,
          default: "",
        },
        what_they_do: {
          type: String,
          default: "",
        },

        // Required by the evaluator.
        // Stores the URLs used to research the company.
        sources: {
          type: [String],
          default: [],
        },
      },

      role: {
        sources: {
          type: [String],
          default: [],
        },
        title: {
          type: String,
          default: "",
        },
        seniority: {
          type: String,
          default: "Not specified",
        },
        responsibilities: {
          type: [String],
          default: [],
        },
        requirements: [
          {
            id: {
              type: String,
              required: true,
            },
            text: {
              type: String,
              required: true,
            },
            kind: {
              type: String,
              enum: [
                "technical",
                "behavioural",
                "domain",
              ],
              default: "technical",
            },
            priority: {
              type: String,
              enum: ["must", "nice"],
              default: "must",
            },
          },
        ],
      },

      questions: [
        {
          id: {
            type: String,
            required: true,
          },
          requirement_ids: {
            type: [String],
            default: [],
          },
          category: {
            type: String,
            enum: [
              "technical",
              "behavioural",
              "system-design",
              "company-fit",
            ],
            default: "technical",
          },
          prompt: {
            type: String,
            default: "",
          },
          answer_outline: {
            type: String,
            default: "",
          },
          difficulty: {
            type: Number,
            min: 1,
            max: 3,
            default: 2,
          },
          isCustom: {
            type: Boolean,
            default: false,
          },
        },
      ],

      flashcards: [
        {
          id: {
            type: String,
            required: true,
          },
          front: {
            type: String,
            default: "",
          },
          back: {
            type: String,
            default: "",
          },
          requirement_ids: {
            type: [String],
            default: [],
          },
          confidence: {
            type: Number,
            default: 0,
          },
        },
      ],

      schedule: {
        days_available: {
          type: Number,
          default: 5,
          min: 1,
          max: 60,
        },
        days: [
          {
            day: {
              type: Number,
              required: true,
            },
            focus: {
              type: String,
              default: "",
            },
            question_ids: {
              type: [String],
              default: [],
            },
            minutes: {
              type: Number,
              default: 60,
            },
          },
        ],
      },

      coverage: {
        uncovered_requirement_ids: {
          type: [String],
          default: [],
        },
        passes: {
          type: Number,
          default: 1,
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

export const Kit = mongoose.model("Kit", kitSchema);
