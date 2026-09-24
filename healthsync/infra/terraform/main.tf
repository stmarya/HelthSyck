terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket         = "healthsync-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "ap-southeast-3"
    encrypt        = true
    dynamodb_table = "healthsync-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "HealthSync"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}
